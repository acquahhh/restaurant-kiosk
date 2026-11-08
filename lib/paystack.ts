import "server-only";
import crypto from "node:crypto";
import { COUNTRY } from "@/lib/countries";
import { providerCode } from "@/lib/kiosk/phone";

/**
 * Paystack, server side only. The secret key never leaves the server.
 * API reference: https://paystack.com/docs/api/
 * Amounts are in the currency's smallest unit; currency from the installation's country.
 */

const BASE = process.env.PAYSTACK_API_BASE ?? "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.PAYSTACK_ORDER_EMAIL);
}

function secret(): string {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("PAYSTACK_NOT_CONFIGURED");
  return k;
}

/**
 * Paystack requires an email on every charge. Kiosk customers do not give one,
 * so receipts go to the restaurant's own address. A plus-tag per order keeps
 * them searchable in the inbox.
 */
export function orderEmail(reference: string): string {
  const base = process.env.PAYSTACK_ORDER_EMAIL ?? "";
  const [user, domain] = base.split("@");
  if (!user || !domain) throw new Error("PAYSTACK_NOT_CONFIGURED");
  return `${user}+${reference.toLowerCase()}@${domain}`;
}

type Envelope<T> = { status: boolean; message: string; data: T };

async function call<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<Envelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!json) throw new Error(`PAYSTACK_HTTP_${res.status}`);
  return json;
}

/** Statuses Paystack returns while a charge is in progress. */
export type ChargeStatus = "pay_offline" | "send_otp" | "success" | "failed" | "pending" | "ongoing" | string;
export interface ChargeData { status: ChargeStatus; reference: string; display_text?: string; gateway_response?: string; message?: string }

export function chargeMobileMoney(p: { reference: string; amount: number; phone: string; network: string; orderNumber: string }) {
  const provider = providerCode(p.network);
  if (!provider) throw new Error(`Unknown mobile money network: ${p.network}`);
  return call<ChargeData>("/charge", {
    method: "POST",
    body: {
      email: orderEmail(p.reference),
      amount: p.amount,
      currency: COUNTRY.currency.code,
      reference: p.reference,
      mobile_money: { phone: p.phone, provider },
      metadata: { order_number: p.orderNumber, source: "kiosk" },
    },
  });
}

export function submitOtp(reference: string, otp: string) {
  return call<ChargeData>("/charge/submit_otp", { method: "POST", body: { reference, otp } });
}

export function initializeCardPayment(p: { reference: string; amount: number; callbackUrl?: string; orderNumber: string }) {
  return call<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: {
      email: orderEmail(p.reference),
      amount: p.amount,
      currency: COUNTRY.currency.code,
      reference: p.reference,
      channels: ["card"],
      // Only when the app has a public https address; otherwise Paystack shows
      // its own confirmation on the customer's phone.
      ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
      metadata: { order_number: p.orderNumber, source: "kiosk" },
    },
  });
}

export interface VerifiedTransaction {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "processing" | "queued" | "reversed" | string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  gateway_response: string;
}

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Webhook authenticity: HMAC-SHA512 of the raw body with the secret key. */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha512", secret()).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
