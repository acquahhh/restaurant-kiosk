"use client";

import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatGhs } from "@/lib/money";

function percent(bp: number) {
  return `${(bp / 100).toLocaleString("en-GH", { maximumFractionDigits: 2 })}%`;
}

/** Subtotal, tax and service lines appear only when the restaurant charges them. */
export function TotalsTable() {
  const { totals, settings } = useKiosk();
  const showBreakdown = totals.taxAmount > 0 || totals.serviceCharge > 0;
  return (
    <dl className="space-y-3 text-xl">
      {showBreakdown ? (
        <>
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatGhs(totals.subtotal)}</dd>
          </div>
          {totals.taxAmount > 0 ? (
            <div className="flex justify-between text-ink-muted">
              <dt>Tax ({percent(settings.tax_rate_bp)})</dt>
              <dd className="tabular-nums">{formatGhs(totals.taxAmount)}</dd>
            </div>
          ) : null}
          {totals.serviceCharge > 0 ? (
            <div className="flex justify-between text-ink-muted">
              <dt>Service charge ({percent(settings.service_charge_bp)})</dt>
              <dd className="tabular-nums">{formatGhs(totals.serviceCharge)}</dd>
            </div>
          ) : null}
        </>
      ) : null}
      <div className={`flex items-baseline justify-between ${showBreakdown ? "border-t border-sand-deep pt-4" : ""}`}>
        <dt className="font-semibold">Total</dt>
        <dd className="price">{formatGhs(totals.total)}</dd>
      </div>
    </dl>
  );
}
