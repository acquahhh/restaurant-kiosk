"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isServerWriteConfigured } from "@/lib/supabase/config";
import { placeOrderSchema, type PaymentStep, type PlaceOrderResult } from "@/lib/kiosk/order-input";
import { startPaystackPayment, submitPaymentOtp, verifyAndRecord } from "@/lib/kiosk/payments";
import { isPaystackConfigured } from "@/lib/paystack";
import { LIMITS, allow, clientAddress } from "@/lib/server/rate-limit";

/** Turns database error codes from place_order() into words for customers. */
type FailureCode = Extract<PlaceOrderResult, { ok: false }>["code"];

function explain(dbMessage: string): { code: FailureCode; message: string } {
  const [code, detail] = dbMessage.split(/:(.*)/s).map((s) => s?.trim());
  switch (code) {
    case "ITEM_UNAVAILABLE":
      return { code: "unavailable", message: `Sorry, ${detail} has just sold out. Remove it from your order to continue.` };
    case "OPTION_UNAVAILABLE":
      return { code: "unavailable", message: `Sorry, ${detail} is no longer available. Change that meal to continue.` };
    case "ITEM_INVALID":
    case "OPTION_INVALID":
      return { code: "unavailable", message: "The menu has changed since you started. Please review your order." };
    case "OPTION_REQUIRED":
      return { code: "invalid", message: `Please complete your choices for ${detail}.` };
    case "TABLE_INVALID":
      return { code: "invalid", message: "That table number is not in use. Please choose your table again." };
    case "NAME_REQUIRED":
      return { code: "invalid", message: "Please enter your name for the takeaway order." };
    case "METHOD_DISABLED":
      return { code: "invalid", message: "That payment method is not available right now. Please choose another." };
    case "EMPTY_ORDER":
      return { code: "invalid", message: "Your order is empty." };
    default:
      return { code: "server_error", message: "Your order could not be placed. Please try again or ask a member of staff." };
  }
}

/**
 * Places a kiosk order through public.place_order(), which reprices and
 * validates everything inside one database transaction.
 *
 * Cash: the order goes straight to the kitchen, unpaid.
 * Mobile Money / card: the order waits as pending_payment and a Paystack
 * charge starts. It reaches the kitchen only after verifyAndRecord() has
 * confirmed the payment with Paystack.
 */
export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "Some order details are missing." };
  }
  const input = parsed.data;

  const device = await clientAddress();
  if (!allow(`order:${device}`, LIMITS.placeOrderPerDevice.limit, LIMITS.placeOrderPerDevice.windowMs) ||
      !allow("order:all", LIMITS.placeOrderTotal.limit, LIMITS.placeOrderTotal.windowMs)) {
    console.warn("[security] order rate limit reached for", device);
    return { ok: false, code: "invalid", message: "Too many orders from this screen just now. Please wait a minute and try again." };
  }

  if (!isServerWriteConfigured()) {
    return { ok: false, code: "not_connected", message: "Ordering is not connected to the kitchen yet. This kiosk is in setup mode." };
  }

  if (input.paymentMethod !== "cash" && !isPaystackConfigured()) {
    return {
      ok: false,
      code: "payment_pending_setup",
      message: "Mobile Money and card payments are not set up on this kiosk. Please choose Pay at the counter.",
    };
  }

  const supabase = createAdminClient();
  // Housekeeping: cancel orders nobody paid for (cheap, indexed).
  await supabase.rpc("expire_unpaid_orders", { p_minutes: 20 });
  const { data, error } = await supabase.rpc("place_order", { p: input });

  if (error) {
    // P0001 = raised by place_order() on purpose; anything else is unexpected.
    if (error.code !== "P0001") console.error("place_order failed", error);
    const { code, message } = explain(error.message);
    return { ok: false, code, message };
  }

  const result = data as { order_id: string; order_number: string; total: number; status: string; payment_status: string; payment_reference?: string | null };
  if (input.paymentMethod === "cash") return { ok: true, orderId: result.order_id, orderNumber: result.order_number };

  // First press of Pay uses the attempt place_order created; every retry
  // (same kiosk key, e.g. "Try again" or a different method) gets a new one.
  let reference = result.payment_reference ?? null;
  if (!reference) {
    const { data: attempt, error: attemptError } = await supabase.rpc("start_payment_attempt", {
      p_order_id: result.order_id, p_method: input.paymentMethod,
    });
    if (attemptError) {
      console.error("start_payment_attempt failed", attemptError);
      return { ok: false, code: "payment_error", message: "Payment could not be started. Please try again or ask a member of staff." };
    }
    const a = attempt as { already_paid: boolean; reference?: string };
    if (a.already_paid) return { ok: true, orderId: result.order_id, orderNumber: result.order_number, payment: { stage: "paid" } };
    reference = a.reference!;
  }

  const payment = await startPaystackPayment({
    reference, amount: result.total, orderNumber: result.order_number, method: input.paymentMethod,
    momoPhone: input.momoPhone, momoNetwork: input.momoNetwork,
  });
  return { ok: true, orderId: result.order_id, orderNumber: result.order_number, payment };
}

const REF_RE = /^ORD-\d{6}-\d{3,}-[0-9a-f]{8,10}$/;

/** Polled by the kiosk while a customer pays. */
export async function checkPayment(reference: string) {
  if (!REF_RE.test(reference)) return { status: "failed" as const, message: "Unknown payment." };
  const device = await clientAddress();
  if (!allow(`check:${device}`, LIMITS.checkPaymentPerDevice.limit, LIMITS.checkPaymentPerDevice.windowMs)) {
    return { status: "pending" as const }; // slow down; the kiosk simply keeps waiting
  }
  try {
    return await verifyAndRecord(reference);
  } catch (e) {
    console.error("checkPayment failed", e);
    return { status: "pending" as const }; // keep waiting; a network blip is not a failed payment
  }
}

/** Telecel Cash: the customer types the voucher code from *110#. */
export async function submitOtp(reference: string, otp: string): Promise<PaymentStep> {
  if (!REF_RE.test(reference) || !/^\d{4,8}$/.test(otp)) return { stage: "otp", reference, message: "", error: "Enter the code exactly as it appears on your phone." };
  if (!allow(`otp:${reference}`, LIMITS.otpPerPayment.limit, LIMITS.otpPerPayment.windowMs)) {
    return { stage: "failed", message: "Too many codes tried for this payment. Please choose Try again for a new payment request." };
  }
  return submitPaymentOtp(reference, otp);
}
