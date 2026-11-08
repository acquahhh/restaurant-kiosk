"use client";

import { useState, useTransition } from "react";
import { cancelOrder, markPaid } from "../actions";
import { btnDanger, btnSecondary } from "../../ui";

export function OrderActions({ orderId, canCancel, canMarkPaid }: { orderId: string; canCancel: boolean; canMarkPaid: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage({ ok: r.ok, text: r.message ?? "" });
      setConfirming(false);
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {canMarkPaid ? <button type="button" disabled={pending} className={btnSecondary} onClick={() => run(() => markPaid(orderId))}>Mark cash paid</button> : null}
        {canCancel && !confirming ? <button type="button" disabled={pending} className={btnDanger} onClick={() => setConfirming(true)}>Cancel order</button> : null}
        {confirming ? (
          <>
            <button type="button" disabled={pending} className={btnSecondary} onClick={() => setConfirming(false)}>Keep order</button>
            <button type="button" disabled={pending} className={`${btnDanger} bg-pepper text-white hover:bg-pepper`} onClick={() => run(() => cancelOrder(orderId))}>Yes, cancel it</button>
          </>
        ) : null}
      </div>
      {message ? <p role="status" className={`text-sm font-semibold ${message.ok ? "text-palm" : "text-pepper"}`}>{message.text}</p> : null}
    </div>
  );
}
