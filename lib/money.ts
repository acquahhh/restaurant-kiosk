/**
 * All amounts are integers in pesewas (GH₵ 1.00 = 100 pesewas).
 * Never do arithmetic on cedi floats.
 */

export type Pesewas = number;

const formatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 7500 → "GH₵ 75.00" */
export function formatGhs(amount: Pesewas): string {
  return `GH₵ ${formatter.format(amount / 100)}`;
}

/** "75.00" or "75" → 7500. Throws on malformed input. */
export function parseGhs(input: string): Pesewas {
  const cleaned = input.replace(/[^\d.]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new Error(`Invalid amount: ${input}`);
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Basis points → pesewas, rounded half-up. 7500 at 1250bp (12.5%) → 938 */
export function applyBasisPoints(amount: Pesewas, bp: number): Pesewas {
  return Math.round((amount * bp) / 10_000);
}

export interface OrderTotals {
  subtotal: Pesewas;
  taxAmount: Pesewas;
  serviceCharge: Pesewas;
  total: Pesewas;
}

export function computeTotals(
  lineTotals: Pesewas[],
  taxRateBp: number,
  serviceChargeBp: number,
): OrderTotals {
  const subtotal = lineTotals.reduce((sum, n) => sum + n, 0);
  const taxAmount = applyBasisPoints(subtotal, taxRateBp);
  const serviceCharge = applyBasisPoints(subtotal, serviceChargeBp);
  return { subtotal, taxAmount, serviceCharge, total: subtotal + taxAmount + serviceCharge };
}
