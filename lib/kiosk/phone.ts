/**
 * Ghana mobile numbers: 10 digits, leading 0. Number portability means a
 * prefix is only a guess at the network, so the customer can always change it.
 */
export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

/** Paystack's mobile_money.provider codes for Ghana. */
export const PAYSTACK_PROVIDER: Record<MomoNetwork, string> = {
  mtn: "mtn",
  telecel: "vod",
  airteltigo: "atl",
};

export const NETWORK_LABEL: Record<MomoNetwork, string> = {
  mtn: "MTN MoMo",
  telecel: "Telecel Cash",
  airteltigo: "AT Money",
};

const PREFIXES: Record<string, MomoNetwork> = {
  "024": "mtn", "025": "mtn", "053": "mtn", "054": "mtn", "055": "mtn", "059": "mtn",
  "020": "telecel", "050": "telecel",
  "026": "airteltigo", "027": "airteltigo", "056": "airteltigo", "057": "airteltigo",
};

export function isValidGhanaPhone(p: string): boolean {
  return /^0[235]\d{8}$/.test(p);
}

export function guessNetwork(p: string): MomoNetwork | null {
  return PREFIXES[p.slice(0, 3)] ?? null;
}

/** "0241234567" → "024 123 4567" (works on partial input) */
export function formatPhone(p: string): string {
  return [p.slice(0, 3), p.slice(3, 6), p.slice(6, 10)].filter(Boolean).join(" ");
}
