"use server";

import { placeOrderSchema, type PlaceOrderResult } from "@/lib/kiosk/order-input";

/**
 * Places a kiosk order.
 *
 * PHASE 2 STATUS: input validation is real; persistence is not built yet.
 * Phase 3 replaces the final return with: reprice from the database, insert
 * the order + items + customizations in one transaction keyed by
 * idempotencyKey, and return the real order number. Until then this always
 * reports that ordering is not connected. It never pretends to succeed.
 */
export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues[0]?.message ?? "Some order details are missing.",
    };
  }

  return {
    ok: false,
    code: "not_connected",
    message: "Ordering is not connected to the kitchen yet. This kiosk is in setup mode.",
  };
}
