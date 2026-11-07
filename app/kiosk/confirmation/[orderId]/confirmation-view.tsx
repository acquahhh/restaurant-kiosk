"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatGhs } from "@/lib/money";
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
    <main className="grid h-full grid-cols-[1fr_1fr]" onPointerDown={() => setRemaining(RETURN_AFTER_SECONDS)}>
      <section className="flex flex-col justify-center bg-palm px-20 text-white">
        <p className="text-3xl font-semibold text-white/80">Your order number</p>
        <p className="mt-2 text-[16rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{order.order_number}</p>
        <h1 className="mt-10 max-w-[22ch] text-4xl font-bold leading-tight">
          Your order has been received. Our kitchen is preparing it.
        </h1>
        <p className="mt-6 max-w-[40ch] text-2xl leading-snug text-white/85">
          {order.order_type === "dine_in"
            ? `Take a seat at table ${order.table_number}. We will bring your food to you.`
            : `We will call ${order.order_number} when your order is ready at the counter.`}
        </p>
      </section>

      <section className="flex min-h-0 flex-col px-16 py-14">
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
                ? `Not paid yet. Pay ${formatGhs(order.total)} at the counter with number ${order.order_number}.`
                : order.payment_status === "paid"
                  ? `Paid, ${formatGhs(order.total)}`
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
              <span className="shrink-0 tabular-nums">{formatGhs(i.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="flex items-baseline justify-between pt-6">
          <span className="text-2xl font-semibold">Total</span>
          <span className="price">{formatGhs(order.total)}</span>
        </div>

        <div className="mt-8 flex items-center gap-6">
          <Button variant="hero" size="lg" className="flex-1" onClick={() => router.replace("/kiosk")}>
            Done
          </Button>
          <p className="w-[220px] text-lg text-ink-muted">
            This screen closes in <span className="font-bold tabular-nums text-ink">{Math.max(remaining, 0)}</span> seconds.
          </p>
        </div>
      </section>
    </main>
  );
}
