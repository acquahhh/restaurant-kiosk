"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = { order_number: string; status: string; updated_at: string };

const POLL_MS = 4_000;

export function BoardView() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stale, setStale] = useState(false);
  const [justReady, setJustReady] = useState<Set<string>>(new Set());
  const readyBefore = useRef<Set<string> | null>(null);

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
      const readyNow = new Set(list.filter((r) => r.status === "ready").map((r) => r.order_number));
      if (readyBefore.current) {
        const fresh = [...readyNow].filter((n) => !readyBefore.current!.has(n));
        if (fresh.length) {
          setJustReady(new Set(fresh));
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
    <main className="grid h-dvh grid-cols-2 bg-canvas" data-surface="kiosk">
      <section className="flex flex-col bg-sand px-12 py-10">
        <h1 className="text-5xl font-extrabold tracking-tight">Preparing</h1>
        <ul className="mt-10 grid grid-cols-3 content-start gap-x-8 gap-y-6">
          {preparing.map((r) => (
            <li key={r.order_number} className="text-7xl font-extrabold tabular-nums tracking-tight text-ink-muted">{r.order_number}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col bg-palm px-12 py-10 text-white">
        <h2 className="text-5xl font-extrabold tracking-tight">Ready for collection</h2>
        <ul className="mt-10 grid grid-cols-3 content-start gap-x-8 gap-y-6">
          {ready.map((r) => (
            <li
              key={r.order_number}
              className={`w-fit rounded-card text-7xl font-extrabold tabular-nums tracking-tight ${justReady.has(r.order_number) ? "bg-plantain px-4 text-ink" : ""}`}
            >
              {r.order_number}
            </li>
          ))}
        </ul>
        <p className="mt-auto text-2xl text-white/80">
          Dine-in orders are brought to your table. Takeaway: collect at the counter when your number shows here.
        </p>
      </section>
      {stale ? (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-button bg-ink px-5 py-2 text-lg font-semibold text-white">
          Reconnecting
        </p>
      ) : null}
    </main>
  );
}
