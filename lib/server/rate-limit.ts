import "server-only";
import { headers } from "next/headers";

/**
 * Simple sliding-window rate limits, kept in memory. The app runs as a single
 * server process inside the restaurant, so memory is the right place: no
 * extra service, and limits reset on restart.
 */
export { allow } from "./sliding-window";

/** The device's address as seen by the server (each kiosk/tablet has its own). */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

/** Limits in one place, sized so a real customer or staff member never meets them. */
export const LIMITS = {
  // A customer places one order every few minutes; Try again re-submits the same order.
  placeOrderPerDevice: { limit: 10, windowMs: 60_000 },
  placeOrderTotal: { limit: 120, windowMs: 60_000 },
  // The payment screen checks every 3 s (20 a minute).
  checkPaymentPerDevice: { limit: 60, windowMs: 60_000 },
  otpPerPayment: { limit: 5, windowMs: 10 * 60_000 },
  signInPerDevice: { limit: 10, windowMs: 10 * 60_000 },
} as const;
