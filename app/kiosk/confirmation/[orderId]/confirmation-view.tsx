"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatMoney } from "@/lib/money";
import { Button } from "../../_components/ui";

export interface ConfirmedOrder {
  id: string;
  order_number: string;
  order_type: "dine_in" | "takeaway";
  status: string;
  table_number: string | null;
  customer_name: string | null;
  total: number;
  payment_status: string;
  payment_method: string | null;
  estimated_ready_at: string | null;
  items: Array<{ id: string; name: string; quantity: number; lineTotal: number; instructions: string | null; options: string[] }>;
}

const RETURN_AFTER_SECONDS = 30;

export function ConfirmationView({ order }: { order: ConfirmedOrder }) {
  const router = useRouter();
  const { reset, hydrated } = useKiosk();
  const [remaining, setRemaining] = useState(RETURN_AFTER_SECONDS);

  // The order is placed: clear the cart now so nothing can be resubmitted.
  useEffect(() => {
    if (hydrated) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    const id = window.setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining <= 0) router.replace("/kiosk");
  }, [remaining, router]);

  const minutes = order.estimated_ready_at
    ? Math.max(1, Math.round((new Date(order.estimated_ready_at).getTime() - Date.now()) / 60000))
    : null;
  const unpaidCash = order.payment_method === "cash" && order.payment_status !== "paid";

  return (
    <main className="grid h-full grid-cols-[1fr_1fr] portrait:grid-cols-1 portrait:grid-rows-[auto_1fr]" onPointerDown={() => setRemaining(RETURN_AFTER_SECONDS)}>
      <section className="relative isolate flex flex-col justify-center overflow-hidden bg-palm px-20 text-white portrait:px-14 portrait:py-12">
        <span aria-hidden className="absolute -right-[16rem] -top-[12rem] -z-10 h-[40rem] w-[40rem] rounded-full border-[3rem] border-white/[0.06] animate-[drift_18s_ease-in-out_infinite_alternate]" />
        {/* A tick that draws itself: the order went through */}
        <svg viewBox="0 0 52 52" className="mb-8 h-24 w-24" aria-hidden>
          <circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-plantain)" strokeWidth="3"
            strokeDasharray="151" strokeDashoffset="151" className="animate-[draw_600ms_ease-out_forwards]" />
          <path d="M15 27l7 7 15-16" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="40" strokeDashoffset="40" className="animate-[draw_400ms_450ms_ease-out_forwards]" />
        </svg>
        <p className="text-3xl font-semibold text-white/80">Your order number</p>
        <p className="mt-2 text-[16rem] portrait:text-[11rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums animate-[pop-in_700ms_300ms_cubic-bezier(0.22,1,0.36,1)_both]">{order.order_number}</p>
        <h1 className="mt-10 max-w-[22ch] text-4xl font-bold leading-tight animate-[rise_600ms_700ms_cubic-bezier(0.22,1,0.36,1)_both]">
          Your order has been received. Our kitchen is preparing it.
        </h1>
        <p className="mt-6 max-w-[40ch] text-2xl leading-snug text-white/85">
          {order.order_type === "dine_in"
            ? `Take a seat at table ${order.table_number}. We will bring your food to you.`
            : `We will call ${order.order_number} when your order is ready at the counter.`}
        </p>
      </section>

      <section className="flex min-h-0 flex-col px-16 py-14 animate-[rise_600ms_200ms_cubic-bezier(0.22,1,0.36,1)_both]">
        <dl className="grid grid-cols-2 gap-x-10 gap-y-6 text-xl">
          <div>
            <dt className="text-ink-muted">Order</dt>
            <dd className="mt-1 text-2xl font-bold">
              {order.order_type === "dine_in" ? `Dine in, table ${order.table_number}` : `Takeaway for ${order.customer_name}`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Ready in about</dt>
            <dd className="mt-1 text-2xl font-bold">{minutes ? `${minutes} minutes` : "Shortly"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-muted">Payment</dt>
            <dd className={`mt-1 text-2xl font-bold ${unpaidCash ? "text-pepper" : ""}`}>
              {unpaidCash
                ? `Not paid yet. Pay ${formatMoney(order.total)} at the counter with number ${order.order_number}.`
                : order.payment_status === "paid"
                  ? `Paid, ${formatMoney(order.total)}`
                  : "Waiting for payment"}
            </dd>
          </div>
        </dl>

        <ul className="mt-10 min-h-0 flex-1 divide-y divide-sand-deep overflow-y-auto border-y border-sand-deep">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-6 py-4 text-xl">
              <span>
                <span className="font-bold tabular-nums">{i.quantity} × </span>
                <span className="font-semibold">{i.name}</span>
                {i.options.length || i.instructions ? (
                  <span className="mt-1 block text-lg text-ink-muted">
                    {[...i.options, i.instructions && `“${i.instructions}”`].filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(i.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between pt-6">
          <span className="text-2xl font-semibold">Total</span>
          <span className="price">{formatMoney(order.total)}</span>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <Button variant="hero" size="lg" className="flex-1" onClick={() => router.replace("/kiosk")}>
            Done
          </Button>
          <p className="w-[13.75rem] text-lg text-ink-muted">
            This screen closes in <span className="font-bold tabular-nums text-ink">{Math.max(remaining, 0)}</span> seconds.
          </p>
        </div>
      </section>
    </main>
  );
}
