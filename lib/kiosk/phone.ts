/**
 * Local mobile numbers and mobile money networks for the installation's
 * country (lib/countries.ts). Number portability means a prefix is only a
 * guess at the network, so the customer can always change it.
 */
import { COUNTRY, type CountryProfile } from "@/lib/countries";

export type MomoNetwork = string;

export function isValidPhone(p: string, country: CountryProfile = COUNTRY): boolean {
  return country.phone.pattern.test(p);
}
/** Kept for existing call sites. */
export const isValidGhanaPhone = (p: string) => isValidPhone(p);

export function phoneLength(country: CountryProfile = COUNTRY): number {
  return country.phone.groups.reduce((a, b) => a + b, 0);
}

export function guessNetwork(p: string, country: CountryProfile = COUNTRY): MomoNetwork | null {
  // Longest matching prefix wins.
  let best: { id: string; len: number } | null = null;
  for (const n of country.mobileMoney.networks) {
    for (const prefix of n.prefixes) {
      if (p.startsWith(prefix) && (!best || prefix.length > best.len)) best = { id: n.id, len: prefix.length };
    }
  }
  return best?.id ?? null;
}

export const NETWORK_LABEL: Record<string, string> = Object.fromEntries(
  COUNTRY.mobileMoney.networks.map((n) => [n.id, n.label]),
);

export function networkIds(country: CountryProfile = COUNTRY): string[] {
  return country.mobileMoney.networks.map((n) => n.id);
}

export function providerCode(network: MomoNetwork, country: CountryProfile = COUNTRY): string | null {
  return country.mobileMoney.networks.find((n) => n.id === network)?.providerCode ?? null;
}

/** "0241234567" → "024 123 4567" (Ghana), "0712345678" → "0712 345 678" (Kenya); works on partial input. */
export function formatPhone(p: string, country: CountryProfile = COUNTRY): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of country.phone.groups) {
    if (i >= p.length) break;
    parts.push(p.slice(i, i + g));
    i += g;
  }
  return parts.join(" ");
}
