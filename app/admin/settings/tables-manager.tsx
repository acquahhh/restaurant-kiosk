"use client";

import { useState, useTransition } from "react";
import { addTable, deleteTable, setTableActive } from "./actions";
import { btnSecondary, input } from "../ui";

export function TablesManager({ tables }: { tables: { id: string; number: string; is_active: boolean }[] }) {
  const [pending, start] = useTransition();
  const [number, setNumber] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNotice(r.message || !r.ok ? { ok: r.ok, text: r.message ?? "Not saved." } : null);
      if (r.ok) after?.();
    });

  return (
    <section className="rounded-xl border border-sand-deep p-5">
      <h2 className="font-bold">Tables</h2>
      <p className="text-sm text-ink-muted">Dine-in customers pick from these on the kiosk. Switch a table off while it is out of use.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tables.map((t) => (
          <div key={t.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${t.is_active ? "border-sand-deep" : "border-dashed border-sand-deep text-ink-muted"}`}>
            <span className="min-w-8 text-center font-bold tabular-nums">{t.number}</span>
            <button type="button" disabled={pending} className="rounded px-1.5 text-sm font-semibold text-ink-muted hover:bg-sand" onClick={() => run(() => setTableActive(t.id, !t.is_active))}>
              {t.is_active ? "Off" : "On"}
            </button>
            <button type="button" disabled={pending} className="rounded px-1.5 text-sm font-semibold text-pepper hover:bg-pepper-soft" aria-label={`Delete table ${t.number}`} onClick={() => run(() => deleteTable(t.id))}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => addTable(number), () => setNumber("")); }}>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="New table, e.g. 17" className={`${input} max-w-[200px]`} aria-label="New table number" />
        <button type="submit" className={btnSecondary} disabled={pending || !number.trim()}>Add table</button>
      </form>
      {notice ? <p role="status" className={`mt-2 text-sm font-semibold ${notice.ok ? "text-palm" : "text-pepper"}`}>{notice.text}</p> : null}
    </section>
  );
}
