"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { lineTotal } from "@/lib/kiosk/cart";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatGhs } from "@/lib/money";
import { FoodImage } from "../_components/food-image";
import { KioskHeader } from "../_components/kiosk-header";
import { orderTypeLabel } from "../_components/order-panel";
import { TotalsTable } from "../_components/totals";
import { Button, Stepper } from "../_components/ui";
import { useCustomize } from "../_components/use-customize";

export default function CartScreen() {
  const router = useRouter();
  const { state, hydrated, changeQuantity, remove } = useKiosk();
  const { openLine, sheet } = useCustomize();

  useEffect(() => {
    if (hydrated && !state.orderType) router.replace("/kiosk/order-type");
  }, [hydrated, state.orderType, router]);

  useEffect(() => {
    router.prefetch("/kiosk/checkout");
  }, [router]);

  const empty = state.lines.length === 0;

  return (
    <>
      <KioskHeader backHref="/kiosk/menu" backLabel="Menu" title="Review your order" />

      <div className="flex min-h-0 flex-1 portrait:flex-col">
        <main className="min-w-0 flex-1 overflow-y-auto px-12 py-8">
          {empty ? (
            <div className="max-w-[40ch] pt-16">
              <h2 className="text-4xl font-bold tracking-tight">Your order is empty</h2>
              <p className="mt-4 text-xl text-ink-muted">Go back to the menu and tap a meal to add it.</p>
              <Button variant="primary" size="lg" className="mt-10" onClick={() => router.push("/kiosk/menu")}>
                Back to the menu
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-sand-deep border-y border-sand-deep">
              {state.lines.map((line) => (
                <li key={line.lineId} className="flex items-center gap-8 py-6">
                  {line.imageUrl ? (
                    <FoodImage src={line.imageUrl} alt="" sizes="160px" className="h-[7.5rem] w-[10rem] shrink-0 rounded-card" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-2xl font-bold leading-tight">{line.name}</h3>
                    {line.optionSummary.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-lg text-ink-muted">
                        {line.optionSummary.map((o) => (
                          <li key={`${o.groupName}-${o.optionName}`} className="flex gap-3">
                            <span>{o.optionName}</span>
                            {o.priceDelta !== 0 ? <span className="tabular-nums">+ {formatGhs(o.priceDelta)}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {line.instructions ? (
                      <p className="mt-2 text-lg italic text-ink-muted">Note: {line.instructions}</p>
                    ) : null}
                    <div className="mt-4 flex gap-2">
                      <Button variant="secondary" onClick={() => openLine(line)}>Change</Button>
                      <Button variant="danger" onClick={() => remove(line.lineId)}>Remove</Button>
                    </div>
                  </div>
                  <Stepper
                    value={line.quantity}
                    onChange={(n) => changeQuantity(line.lineId, n)}
                    label={`${line.name} quantity`}
                  />
                  <div className="w-[11.25rem] shrink-0 text-right">
                    <span className="text-2xl font-extrabold tabular-nums">{formatGhs(lineTotal(line))}</span>
                    {line.quantity > 1 ? (
                      <span className="mt-1 block text-lg tabular-nums text-ink-muted">{formatGhs(line.unitPrice)} each</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>

        <aside className="flex w-[32.5rem] shrink-0 flex-col border-l border-sand-deep bg-sand px-10 py-8 portrait:w-full portrait:border-l-0 portrait:border-t">
          <h2 className="text-2xl font-semibold">{orderTypeLabel(state.orderType, state.tableNumber, state.customerName)}</h2>
          <button
            type="button"
            className="-ml-2 inline-flex min-h-touch items-center self-start px-2 text-lg font-semibold text-palm underline decoration-2 underline-offset-4"
            onClick={() => router.push("/kiosk/order-type")}
          >
            Change
          </button>
          <div className="mt-auto">
            <TotalsTable />
            <Button
              variant="hero"
              size="lg"
              className="mt-6 w-full"
              disabled={empty}
              onClick={() => router.push("/kiosk/checkout")}
            >
              Continue to checkout
            </Button>
            <Button variant="ghost" size="lg" className="mt-2 w-full" onClick={() => router.push("/kiosk/menu")}>
              Add more items
            </Button>
          </div>
        </aside>
      </div>

      {sheet}
    </>
  );
}
