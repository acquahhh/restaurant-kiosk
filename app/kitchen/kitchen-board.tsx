"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrderStatus } from "@/lib/db/database.types";
import { formatMoney } from "@/lib/money";
import { formatTime } from "@/lib/time";
import { signOut } from "../login/actions";
import { announceReady, autoUnlock, chime, isAnnouncerUnlocked, onUnlockChange } from "@/lib/client/announcer";

export interface KitchenOrder {
  id: string;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  status: OrderStatus;
  table_number: string | null;
  customer_name: string | null;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  payment_method: "cash" | "mobile_money" | "card" | null;
  total: number;
  placed_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  items: Array<{ id: string; name: string; quantity: number; instructions: string | null; options: string[] }>;
}

type Lane = "received" | "preparing" | "ready" | "completed";

const LANES: Array<{ status: Lane; title: string; accent: string; next?: { to: OrderStatus; label: string }; back?: OrderStatus }> = [
  { status: "received", title: "New orders", accent: "var(--color-status-new)", next: { to: "preparing", label: "Start preparing" } },
  { status: "preparing", title: "Preparing", accent: "var(--color-status-preparing)", next: { to: "ready", label: "Ready for collection" }, back: "received" },
  { status: "ready", title: "Ready", accent: "var(--color-status-ready)", next: { to: "completed", label: "Collected" }, back: "preparing" },
  { status: "completed", title: "Completed", accent: "var(--color-status-done)", back: "ready" },
];

const POLL_MS_WHEN_LIVE = 60_000;     // safety net even when realtime is healthy
const POLL_MS_WHEN_OFFLINE = 5_000;   // realtime down: keep the kitchen current anyway
const NEW_HIGHLIGHT_MS = 15_000;

function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function KitchenBoard({
  initialOrders, restaurantName, staffName, role, soundDefault,
}: {
  initialOrders: KitchenOrder[];
  restaurantName: string;
  staffName: string;
  role: "admin" | "manager" | "kitchen";
  soundDefault: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState(initialOrders);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // New-order chime is always on (Admin > Settings can disable it); the first
  // touch on the screen enables sound, or none at all with the autoplay start-up flag.
  const [soundReady, setSoundReady] = useState(false);
  const [announceOn, setAnnounceOn] = useState(false);
  const [arrivedAt, setArrivedAt] = useState<Map<string, number>>(new Map());
  const known = useRef(new Set(initialOrders.map((o) => o.id)));
  const soundRef = useRef(soundDefault);
  soundRef.current = soundDefault;

  useEffect(() => {
    const sync = () => setSoundReady(isAnnouncerUnlocked());
    const off = onUnlockChange(sync);
    const cleanup = autoUnlock();
    sync();
    return () => {
      off();
      cleanup();
    };
  }, []);

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("kitchen_orders");
    if (rpcError) {
      // Session expired on a wall screen left running: send staff to sign in again.
      if (rpcError.message.includes("NOT_ALLOWED") || rpcError.code === "PGRST301") window.location.href = "/login?next=/kitchen";
      return;
    }
    const next = (data as unknown as KitchenOrder[]) ?? [];
    const fresh = next.filter((o) => o.status === "received" && !known.current.has(o.id));
    next.forEach((o) => known.current.add(o.id));
    if (fresh.length > 0) {
      setArrivedAt((m) => {
        const copy = new Map(m);
        fresh.forEach((o) => copy.set(o.id, Date.now()));
        return copy;
      });
      if (soundRef.current) chime("new");
    }
    setOrders(next);
  }, [supabase]);

  // Realtime: any change to orders triggers a refetch of the full feed.
  useEffect(() => {
    const channel = supabase
      .channel("kitchen-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLive("live");
          void refresh(); // catch anything placed while we were connecting
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLive("offline");
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refresh]);

  // Polling safety net; fast while realtime is unavailable.
  useEffect(() => {
    const id = window.setInterval(() => void refresh(), live === "live" ? POLL_MS_WHEN_LIVE : POLL_MS_WHEN_OFFLINE);
    return () => window.clearInterval(id);
  }, [live, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  async function run(orderId: string, call: () => PromiseLike<{ error: { message: string } | null }>, optimistic?: OrderStatus) {
    if (busy.has(orderId)) return;
    setBusy((b) => new Set(b).add(orderId));
    setError(null);
    const previous = orders;
    if (optimistic) setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, status: optimistic } : o)));
    const { error: callError } = await call();
    if (callError) {
      setOrders(previous);
      setError(
        callError.message.includes("BAD_TRANSITION")
          ? "That order was already moved on another screen. The board has been refreshed."
          : "The change was not saved. Check the connection and try again.",
      );
    }
    await refresh();
    setBusy((b) => {
      const copy = new Set(b);
      copy.delete(orderId);
      return copy;
    });
  }

  const setStatus = (id: string, to: OrderStatus) => {
    // Optional: this screen calls takeaway numbers itself (no customer status board).
    const order = orders.find((o) => o.id === id);
    if (announceOn && to === "ready" && order?.order_type === "takeaway") announceReady(order.order_number);
    return run(id, () => supabase.rpc("set_order_status", { p_order_id: id, p_status: to }), to);
  };
  const markPaid = (id: string) => run(id, () => supabase.rpc("mark_cash_paid", { p_order_id: id }));


  const byLane = (lane: Lane) => {
    const list = orders.filter((o) => o.status === lane);
    return lane === "completed"
      ? list.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")).slice(0, 12)
      : list;
  };

  return (
    <div className="flex h-dvh flex-col" data-surface="kitchen">
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-t-4 border-b-slate-line border-t-palm px-5 py-3">
        <h1 className="flex items-center gap-2.5 text-xl font-bold">
          <span className="h-2.5 w-2.5 rounded-full bg-plantain" aria-hidden />
          {restaurantName} <span className="font-normal text-white/50">Kitchen</span>
        </h1>
        <span
          className={`flex items-center gap-2 text-sm font-semibold ${live === "live" ? "text-status-ready" : live === "offline" ? "text-status-new" : "text-white/60"}`}
          role="status"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-current" aria-hidden />
          {live === "live" ? "Live" : live === "offline" ? "Live updates paused, checking every 5 seconds" : "Connecting"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAnnounceOn(!announceOn)}
            aria-pressed={announceOn}
            title="Speak takeaway order numbers when you mark them ready. Use when there is no customer status screen."
            className={`h-11 rounded-lg px-4 text-sm font-semibold ${announceOn ? "bg-white text-slate" : "border border-slate-line text-white/80"}`}
          >
            {announceOn ? "Calling out ready orders" : "Call out ready orders"}
          </button>
          <span className="hidden text-sm text-white/60 sm:inline">{staffName}</span>
          {role !== "kitchen" ? (
            <a href="/admin" className="h-11 content-center rounded-lg border border-slate-line px-4 text-sm font-semibold text-white/80">Admin</a>
          ) : null}
          <form action={signOut}>
            <button type="submit" className="h-11 rounded-lg border border-slate-line px-4 text-sm font-semibold text-white/80">Sign out</button>
          </form>
        </div>
      </header>

      {error ? (
        <p role="alert" className="shrink-0 bg-pepper px-5 py-2 text-sm font-semibold text-white">{error}</p>
      ) : null}
      {soundDefault && !soundReady ? (
        <p className="shrink-0 bg-status-new px-5 py-2 text-center text-base font-bold text-slate" role="status">
          Tap anywhere on this screen to turn on the new-order sound
        </p>
      ) : null}

      <main className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto p-3 lg:grid lg:grid-cols-[1fr_1fr_1fr_minmax(240px,0.7fr)] lg:overflow-x-visible">
        {LANES.map((lane) => {
          const list = byLane(lane.status);
          const compact = lane.status === "completed";
          return (
            <section
              key={lane.status}
              aria-labelledby={`lane-${lane.status}`}
              className="flex min-h-0 w-[85vw] shrink-0 snap-start flex-col rounded-xl bg-slate-raised sm:w-[420px] lg:w-auto"
            >
              <h2 id={`lane-${lane.status}`} className="flex items-center justify-between px-4 pb-2 pt-3 text-sm font-bold uppercase tracking-wider" style={{ color: lane.accent }}>
                {lane.title}
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-white tabular-nums">{list.length}</span>
              </h2>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                {list.length === 0 ? (
                  <p className="px-1 pt-2 text-sm text-white/40">
                    {lane.status === "received" ? "No new orders." : lane.status === "completed" ? "Nothing completed in the last two hours." : "None."}
                  </p>
                ) : null}
                {list.map((order) => {
                  const since = lane.status === "preparing" && order.preparing_at ? order.preparing_at
                    : lane.status === "ready" && order.ready_at ? order.ready_at : order.placed_at;
                  const age = minutesSince(order.placed_at, now);
                  const late = lane.status !== "completed" && lane.status !== "ready" && age >= 20;
                  const slow = lane.status !== "completed" && lane.status !== "ready" && age >= 10;
                  const isNew = (arrivedAt.get(order.id) ?? 0) > now - NEW_HIGHLIGHT_MS && lane.status === "received";
                  const unpaid = order.payment_status !== "paid";
                  return (
                    <article
                      key={order.id}
                      className={`rounded-lg border-l-[6px] bg-slate shadow-[0_0.25rem_1rem_rgba(0,0,0,0.25)] animate-[rise_380ms_cubic-bezier(0.22,1,0.36,1)_both] ${isNew ? "ring-2 ring-status-new" : ""} ${compact ? "px-3 py-2" : "p-4"}`}
                      style={{ borderLeftColor: lane.accent }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`${compact ? "text-xl" : "text-4xl"} font-extrabold tabular-nums tracking-tight`}>{order.order_number}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums ${late ? "bg-[#ff8a80]/15 text-[#ff8a80]" : slow ? "bg-status-new/15 text-status-new" : "bg-white/5 text-white/60"}`}>
                          {compact
                            ? formatTime(order.completed_at ?? order.placed_at)
                            : `${minutesSince(since, now)} min${lane.status === "received" ? "" : ` in ${lane.title.toLowerCase()}`}`}
                        </span>
                      </div>
                      <p className={`${compact ? "text-sm" : "mt-1 text-lg"} font-semibold text-white/85`}>
                        {order.order_type === "dine_in" ? `Table ${order.table_number}` : `Takeaway: ${order.customer_name}`}
                      </p>

                      {!compact ? (
                        <>
                          <ul className="mt-3 space-y-2 border-t border-slate-line pt-3">
                            {order.items.map((item) => (
                              <li key={item.id}>
                                <p className="text-xl font-bold leading-snug">
                                  <span className="tabular-nums text-status-new">{item.quantity} ×</span> {item.name}
                                </p>
                                {item.options.length > 0 ? (
                                  <p className="text-base leading-snug text-white/70">{item.options.join(", ")}</p>
                                ) : null}
                                {item.instructions ? (
                                  <p className="mt-1 rounded bg-status-new/15 px-2 py-1 text-base font-semibold text-status-new">
                                    Note: {item.instructions}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>

                          {unpaid ? (
                            <div className="mt-3 flex items-center justify-between gap-3 rounded bg-white/5 px-3 py-2">
                              <span className="text-sm font-semibold text-[#ff8a80]">
                                {order.payment_method === "cash" ? `Unpaid, cash ${formatMoney(order.total)}` : "Payment not confirmed"}
                              </span>
                              {order.payment_method === "cash" ? (
                                <button
                                  type="button"
                                  disabled={busy.has(order.id)}
                                  onClick={() => void markPaid(order.id)}
                                  className="h-10 shrink-0 whitespace-nowrap rounded-md border border-white/30 px-3 text-sm font-semibold disabled:opacity-40"
                                >
                                  Mark paid
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm font-semibold text-status-ready">Paid</p>
                          )}

                          {lane.next ? (
                            <button
                              type="button"
                              disabled={busy.has(order.id)}
                              onClick={() => void setStatus(order.id, lane.next!.to)}
                              className="mt-3 h-14 w-full rounded-lg text-lg font-bold text-slate disabled:opacity-50"
                              style={{ background: lane.accent }}
                            >
                              {lane.next.label}
                            </button>
                          ) : null}
                          {lane.back ? (
                            <button
                              type="button"
                              disabled={busy.has(order.id)}
                              onClick={() => void setStatus(order.id, lane.back!)}
                              className="mt-2 h-10 w-full rounded-lg text-sm font-semibold text-white/50 disabled:opacity-40"
                            >
                              Move back
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={busy.has(order.id)}
                          onClick={() => void setStatus(order.id, "ready")}
                          className="mt-1 text-sm font-semibold text-white/50 underline underline-offset-2"
                        >
                          Reopen
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
