"use client";

import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { lineTotal, type CartLine } from "@/lib/kiosk/cart";
import { formatMoney } from "@/lib/money";
import { Button, Stepper } from "./ui";

export function orderTypeLabel(orderType: string | null, table: string | null, name: string) {
  if (orderType === "dine_in") return `Dine in, table ${table}`;
  if (orderType === "takeaway") return `Takeaway for ${name}`;
  return "";
}

export function OrderPanel({ onEdit }: { onEdit: (line: CartLine) => void }) {
  const router = useRouter();
  const { state, totals, count, changeQuantity, lastAddedAt } = useKiosk();
  const lastLineId = state.lines.at(-1)?.lineId;

  return (
    <aside className="flex w-[28.75rem] shrink-0 flex-col border-l border-sand-deep bg-sand portrait:w-full portrait:flex-row portrait:items-center portrait:border-l-0 portrait:border-t" aria-label="Your order">
      <div className="px-8 pb-4 pt-7 portrait:flex-1 portrait:py-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Your order</h2>
          {count > 0 ? (
            <span key={lastAddedAt} className="text-xl font-semibold tabular-nums text-ink-muted animate-[count-pop_320ms_ease-out]">
              {count} {count === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => router.push("/kiosk/order-type")}
          className="-ml-2 mt-1 inline-flex min-h-touch items-center px-2 text-lg font-semibold text-palm underline decoration-2 underline-offset-4"
        >
          {orderTypeLabel(state.orderType, state.tableNumber, state.customerName)}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 portrait:hidden">
        {state.lines.length === 0 ? (
          <p className="px-4 pt-10 text-xl leading-relaxed text-ink-muted">
            Your order is empty. Tap a meal to add it.
          </p>
        ) : (
          <ul className="space-y-2 pb-4">
            {state.lines.map((line) => (
              <li
                key={line.lineId}
                className={`rounded-card bg-canvas p-4 ${
                  line.lineId === lastLineId && lastAddedAt ? "animate-[line-in_420ms_cubic-bezier(0.22,1,0.36,1)]" : ""
                }`}
              >
                <button type="button" className="block w-full text-left" onClick={() => onEdit(line)}>
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="text-xl font-bold leading-tight">{line.name}</span>
                    <span className="shrink-0 text-xl font-bold tabular-nums">{formatMoney(lineTotal(line))}</span>
                  </span>
                  {line.optionSummary.length > 0 || line.instructions ? (
                    <span className="mt-1 block text-base leading-snug text-ink-muted">
                      {[...line.optionSummary.map((o) => o.optionName), line.instructions && `“${line.instructions}”`]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  ) : null}
                </button>
                <div className="mt-3 flex items-center justify-between">
                  <Stepper
                    compact
                    allowZero
                    value={line.quantity}
                    onChange={(n) => changeQuantity(line.lineId, n)}
                    label={`${line.name} quantity`}
                  />
                  <button
                    type="button"
                    className="min-h-14 px-3 text-lg font-semibold text-palm"
                    onClick={() => onEdit(line)}
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-sand-deep px-8 pb-8 pt-5 portrait:flex portrait:items-center portrait:gap-8 portrait:border-t-0 portrait:py-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xl font-semibold">Total</span>
          <span className="price">{formatMoney(totals.total)}</span>
        </div>
        <Button
          variant="hero"
          size="lg"
          className="mt-5 w-full portrait:mt-0 portrait:w-[20rem]"
          disabled={state.lines.length === 0}
          onClick={() => router.push("/kiosk/cart")}
        >
          Review order
        </Button>
      </div>
    </aside>
  );
}
