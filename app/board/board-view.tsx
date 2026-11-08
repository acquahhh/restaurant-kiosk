"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/time";
import { announceReady, autoUnlock, isAnnouncerUnlocked, onUnlockChange, unlockAnnouncer } from "@/lib/client/announcer";

type Row = { order_number: string; status: string; order_type: "dine_in" | "takeaway"; updated_at: string };

const POLL_MS = 4_000;

export function BoardView({ restaurantName, logoUrl }: { restaurantName: string; logoUrl: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stale, setStale] = useState(false);
  const [justReady, setJustReady] = useState<Set<string>>(new Set());
  const readyBefore = useRef<Set<string> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(formatTime(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Sound: on without a touch when the browser allows it, else on the first touch anywhere.
  useEffect(() => {
    const sync = () => setSoundOn(isAnnouncerUnlocked());
    const off = onUnlockChange(sync);
    const cleanup = autoUnlock();
    sync();
    return () => {
      off();
      cleanup();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase.rpc("order_board");
      if (!alive) return;
      if (error) {
        setStale(true);
        return;
      }
      setStale(false);
      const list = (data ?? []) as Row[];
      // Database not updated with 0007: cannot tell takeaway from dine-in.
      setNeedsUpdate(list.length > 0 && list.every((r) => r.order_type === undefined));
      const readyNow = new Set(list.filter((r) => r.status === "ready").map((r) => r.order_number));
      if (readyBefore.current) {
        const fresh = [...readyNow].filter((n) => !readyBefore.current!.has(n));
        if (fresh.length) {
          setJustReady(new Set(fresh));
          // Say takeaway numbers aloud; dine-in food is brought to the table.
          for (const n of fresh) {
            if (list.find((r) => r.order_number === n)?.order_type === "takeaway") announceReady(n);
          }
          window.setTimeout(() => setJustReady(new Set()), 20_000);
        }
      }
      readyBefore.current = readyNow;
      setRows(list);
    }
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [supabase]);

  const preparing = rows?.filter((r) => r.status === "received" || r.status === "preparing") ?? [];
  const ready = rows?.filter((r) => r.status === "ready") ?? [];

  return (
    <div className="flex h-dvh flex-col bg-canvas" data-surface="kiosk">
      {needsUpdate ? (
        <p role="alert" className="bg-pepper py-3 text-center text-xl font-semibold text-white">
          Announcements need a database update: run supabase/migrations/0007_board_order_type.sql in Supabase.
        </p>
      ) : null}

      <header className="flex shrink-0 items-center justify-between bg-ink px-12 py-5 text-white">
        <span className="flex items-center gap-4 text-3xl font-extrabold tracking-tight">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-14 w-14 rounded-full bg-white object-contain p-1" />
          ) : (
            <span className="h-4 w-4 rounded-full bg-plantain" aria-hidden />
          )}
          {restaurantName}
        </span>
        <span className="text-3xl font-bold tabular-nums text-white/80">{clock}</span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[1fr_1.35fr] portrait:grid-cols-1 portrait:grid-rows-[1fr_1.35fr]">
        <section className="flex min-h-0 flex-col bg-sand px-12 py-10" aria-labelledby="preparing-title">
          <h1 id="preparing-title" className="flex items-baseline gap-4 text-5xl font-extrabold tracking-tight">
            Preparing
            <span className="text-3xl font-bold text-ink-muted tabular-nums">{preparing.length}</span>
          </h1>
          {preparing.length === 0 ? (
            <p className="mt-10 text-2xl text-ink-muted">No orders being prepared right now.</p>
          ) : (
            <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] content-start gap-4 overflow-hidden">
              {preparing.map((r) => (
                <li key={r.order_number} className="rounded-card bg-canvas py-5 text-center text-6xl font-extrabold tabular-nums tracking-tight text-ink-muted animate-[rise_500ms_cubic-bezier(0.22,1,0.36,1)_both]">
                  {r.order_number}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="relative isolate flex min-h-0 flex-col overflow-hidden bg-palm px-12 py-10 text-white" aria-labelledby="ready-title">
          <span aria-hidden className="absolute -right-[14rem] -top-[14rem] -z-10 h-[36rem] w-[36rem] rounded-full border-[3rem] border-white/[0.06] animate-[drift_20s_ease-in-out_infinite_alternate]" />
          <h2 id="ready-title" className="text-5xl font-extrabold tracking-tight">Ready for collection</h2>
          {ready.length === 0 ? (
            <p className="mt-10 text-2xl text-white/75">Ready orders appear here. Takeaway numbers are also called out.</p>
          ) : (
            <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] content-start gap-5 overflow-hidden">
              {ready.map((r) => {
                const fresh = justReady.has(r.order_number);
                return (
                  <li
                    key={r.order_number}
                    className={`rounded-card bg-plantain py-6 text-center text-ink animate-[pop-in_600ms_cubic-bezier(0.22,1,0.36,1)_both] ${
                      fresh ? "[animation:pop-in_600ms_cubic-bezier(0.22,1,0.36,1)_both,ready-glow_1.6s_600ms_ease-in-out_2]" : ""
                    }`}
                  >
                    <span className="block text-8xl font-extrabold leading-none tabular-nums tracking-tight">{r.order_number}</span>
                    <span className="mt-2 block text-lg font-bold uppercase tracking-wider text-ink/70">
                      {r.order_type === "takeaway" ? "At the counter" : "To your table"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-auto pt-6 text-2xl text-white/80">
            Dine-in orders are brought to your table. Takeaway: collect at the counter when your number shows here.
          </p>
        </section>
      </main>

      {!soundOn ? (
        <button type="button" onClick={() => unlockAnnouncer()} className="shrink-0 bg-ink py-5 text-center text-2xl font-semibold text-white">
          Tap here to turn on announcements for takeaway orders
        </button>
      ) : null}
      {stale ? (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-button bg-ink px-5 py-2 text-lg font-semibold text-white">Reconnecting</p>
      ) : null}
    </div>
  );
}
