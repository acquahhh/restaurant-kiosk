/**
 * Country profiles. Each installation serves one restaurant in one country,
 * chosen at setup (NEXT_PUBLIC_COUNTRY in .env.local, mirrored in the
 * database's restaurant_settings.country for date calculations).
 *
 * Amounts are always whole numbers in the currency's smallest unit:
 * pesewas (GHS), cents (KES), francs (RWF has no smaller unit).
 */

export type CountryCode = "GH" | "RW" | "KE";
export type PaymentProviderId = "paystack" | "intouch";

export interface MobileNetwork {
  id: string;
  label: string;
  /** Number prefixes as dialled locally (a guess only: numbers can be ported). */
  prefixes: string[];
  /** The code the payment provider expects for this network. */
  providerCode: string;
}

export interface CountryProfile {
  code: CountryCode;
  name: string;
  currency: { code: string; symbol: string; exponent: 0 | 2 };
  locale: string;
  timeZone: string;
  /** Local mobile number, e.g. 0241234567. */
  phone: { pattern: RegExp; example: string; groups: number[] };
  mobileMoney: { provider: PaymentProviderId; networks: MobileNetwork[]; ready: boolean };
  card: { provider: PaymentProviderId; ready: boolean };
  /** Spoken/screen languages restaurants in this country usually offer. */
  languages: string[];
}

export const COUNTRIES: Record<CountryCode, CountryProfile> = {
  GH: {
    code: "GH",
    name: "Ghana",
    currency: { code: "GHS", symbol: "GH₵", exponent: 2 },
    locale: "en-GH",
    timeZone: "Africa/Accra",
    phone: { pattern: /^0[235]\d{8}$/, example: "024 123 4567", groups: [3, 3, 4] },
    mobileMoney: {
      provider: "paystack",
      ready: true,
      networks: [
        { id: "mtn", label: "MTN MoMo", providerCode: "mtn", prefixes: ["024", "025", "053", "054", "055", "059"] },
        { id: "telecel", label: "Telecel Cash", providerCode: "vod", prefixes: ["020", "050"] },
        { id: "airteltigo", label: "AT Money", providerCode: "atl", prefixes: ["026", "027", "056", "057"] },
      ],
    },
    card: { provider: "paystack", ready: true },
    languages: ["en", "tw", "gaa", "ee", "ha"],
  },
  RW: {
    code: "RW",
    name: "Rwanda",
    currency: { code: "RWF", symbol: "RWF", exponent: 0 },
    locale: "en-RW",
    timeZone: "Africa/Kigali",
    phone: { pattern: /^07[2389]\d{7}$/, example: "078 123 4567", groups: [3, 3, 4] },
    mobileMoney: {
      // Intouch: network codes to be confirmed from Intouch's API documentation.
      provider: "intouch",
      ready: false,
      networks: [
        { id: "mtn", label: "MTN MoMo", providerCode: "mtn", prefixes: ["078", "079"] },
        { id: "airtel", label: "Airtel Money", providerCode: "airtel", prefixes: ["072", "073"] },
      ],
    },
    card: { provider: "intouch", ready: false },
    languages: ["rw", "en", "fr", "sw"],
  },
  KE: {
    code: "KE",
    name: "Kenya",
    currency: { code: "KES", symbol: "KSh", exponent: 2 },
    locale: "en-KE",
    timeZone: "Africa/Nairobi",
    phone: { pattern: /^0(7\d{8}|1[01]\d{7})$/, example: "0712 345 678", groups: [4, 3, 3] },
    mobileMoney: {
      // Paystack Kenya: M-PESA and Airtel Money. Provider codes to be verified when Kenya is built.
      provider: "paystack",
      ready: false,
      networks: [
        { id: "mpesa", label: "M-PESA", providerCode: "mpesa", prefixes: ["070", "071", "072", "074", "079", "011"] },
        { id: "airtel", label: "Airtel Money", providerCode: "atl", prefixes: ["073", "075", "078", "010"] },
      ],
    },
    card: { provider: "paystack", ready: false },
    languages: ["sw", "en"],
  },
};

export function getCountry(code?: string | null): CountryProfile {
  return COUNTRIES[(code ?? "GH").toUpperCase() as CountryCode] ?? COUNTRIES.GH;
}

/** The country this installation was set up for. */
export const COUNTRY: CountryProfile = getCountry(process.env.NEXT_PUBLIC_COUNTRY);
