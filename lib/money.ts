/**
 * Money is always a whole number in the currency's smallest unit:
 * pesewas (GHS), cents (KES), francs (RWF has no smaller unit).
 * Never do arithmetic on decimal amounts.
 */
import { COUNTRY, type CountryProfile } from "./countries";

/** Whole number of the currency's smallest unit (pesewas, cents, francs). */
export type Pesewas = number;
export type MinorUnits = number;

const formatters = new Map<string, Intl.NumberFormat>();
function formatterFor(c: CountryProfile) {
  let f = formatters.get(c.code);
  if (!f) {
    f = new Intl.NumberFormat("en-GB", {
      minimumFractionDigits: c.currency.exponent,
      maximumFractionDigits: c.currency.exponent,
    });
    formatters.set(c.code, f);
  }
  return f;
}

/** 7500 → "GH₵ 75.00" (Ghana), 3500 → "RWF 3,500" (Rwanda), 45000 → "KSh 450.00" (Kenya). */
export function formatMoney(amount: MinorUnits, country: CountryProfile = COUNTRY): string {
  const value = country.currency.exponent === 0 ? amount : amount / 10 ** country.currency.exponent;
  return `${country.currency.symbol} ${formatterFor(country).format(value)}`;
}

/** Typed amount → smallest unit. "75.5" → 7550 (GHS), "3,500" → 3500 (RWF). Throws on malformed input. */
export function parseMoney(input: string, country: CountryProfile = COUNTRY): MinorUnits {
  const cleaned = input.replace(/[^\d.]/g, "");
  const exp = country.currency.exponent;
  const pattern = exp === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${exp}})?$`);
  if (!pattern.test(cleaned)) throw new Error(`Invalid amount: ${input}`);
  if (exp === 0) return Number(cleaned);
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 10 ** exp + Number(frac.padEnd(exp, "0"));
}

/** Editable text for an amount: 7550 → "75.50" (GHS), 3500 → "3500" (RWF). */
export function toInputText(amount: MinorUnits, country: CountryProfile = COUNTRY): string {
  const exp = country.currency.exponent;
  return exp === 0 ? String(amount) : (amount / 10 ** exp).toFixed(exp);
}

/** Kept for existing call sites and tests: Ghana-style names, now country-aware. */
export const formatGhs = (amount: MinorUnits) => formatMoney(amount);
export const parseGhs = (input: string) => parseMoney(input);

/** Basis points → smallest unit, rounded half-up. 7500 at 1250bp (12.5%) → 938 */
export function applyBasisPoints(amount: MinorUnits, bp: number): MinorUnits {
  return Math.round((amount * bp) / 10_000);
}

export interface OrderTotals {
  subtotal: MinorUnits;
  taxAmount: MinorUnits;
  serviceCharge: MinorUnits;
  total: MinorUnits;
}

export function computeTotals(lineTotals: MinorUnits[], taxRateBp: number, serviceChargeBp: number): OrderTotals {
  const subtotal = lineTotals.reduce((sum, n) => sum + n, 0);
  const taxAmount = applyBasisPoints(subtotal, taxRateBp);
  const serviceCharge = applyBasisPoints(subtotal, serviceChargeBp);
  return { subtotal, taxAmount, serviceCharge, total: subtotal + taxAmount + serviceCharge };
}
