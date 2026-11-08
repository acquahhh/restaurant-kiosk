import "server-only";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chargeMobileMoney, initializeCardPayment, submitOtp as paystackSubmitOtp, verifyTransaction,
  type ChargeData, type MOMO_PROVIDER,
} from "@/lib/paystack";
import type { PaymentStep } from "./order-input";

/** One readable line per payment step in the server log. Statuses only: never keys, phone numbers or card data. */
function trace(reference: string, what: string) {
  console.info(`[payment] ${reference} ${what}`);
}

const GENERIC_FAIL = "The payment did not go through. Please try again or choose another way to pay.";

/** Paystack's words for a declined charge are often technical; keep only the useful ones. */
function friendlyFailure(text: string | undefined): string {
  const t = (text ?? "").toLowerCase();
  if (t.includes("insufficient")) return "There is not enough money in that wallet. Top up or choose another way to pay.";
  if (t.includes("timeout") || t.includes("timed out") || t.includes("expired")) return "The payment request expired before it was approved. Please try again.";
  if (t.includes("declined") || t.includes("cancel")) return "The payment was declined on the phone. Please try again or choose another way to pay.";
  if (t.includes("otp") || t.includes("voucher")) return "That code was not accepted. Please check it and try again.";
  return GENERIC_FAIL;
}

export function stepFromCharge(reference: string, data: ChargeData, network: string): PaymentStep {
  switch (data.status) {
    case "success":
      return { stage: "approve", reference, message: "Confirming your payment." };
    case "send_otp":
      return {
        stage: "otp",
        reference,
        // Paystack's own instruction is specific to the network; prefer it.
        message: data.display_text ?? "Enter the code sent to your phone. Telecel Cash users: dial *110#, choose Make Payments, then Generate Voucher.",
      };
    case "failed":
      return { stage: "failed", message: friendlyFailure(data.gateway_response ?? data.message) };
    default:
      return {
        stage: "approve",
        reference,
        message:
          data.display_text ??
          (network === "mtn"
            ? "Check your phone and approve the payment prompt. If none appears, dial *170#, choose My Wallet, then My Approvals."
            : "Check your phone and approve the payment prompt."),
      };
  }
}

export async function startPaystackPayment(p: {
  reference: string; amount: number; orderNumber: string;
  method: "mobile_money" | "card"; momoPhone?: string; momoNetwork?: keyof typeof MOMO_PROVIDER | null;
}): Promise<PaymentStep> {
  const admin = createAdminClient();
  try {
    if (p.method === "mobile_money") {
      const res = await chargeMobileMoney({ reference: p.reference, amount: p.amount, phone: p.momoPhone!, network: p.momoNetwork!, orderNumber: p.orderNumber });
      if (!res.status) {
        trace(p.reference, `mobile money refused by Paystack: "${res.message}"`);
        await admin.rpc("fail_payment", { p_reference: p.reference, p_raw: res as never });
        return { stage: "failed", message: friendlyFailure(res.message) };
      }
      trace(p.reference, `mobile money (${p.momoNetwork}) started: Paystack says "${res.data.status}"`);
      return stepFromCharge(p.reference, res.data, p.momoNetwork!);
    }
    // A customer's phone cannot open an address inside the restaurant's network.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const callbackUrl = appUrl.startsWith("https://") ? `${appUrl}/pay/done` : undefined;
    const res = await initializeCardPayment({ reference: p.reference, amount: p.amount, orderNumber: p.orderNumber, callbackUrl });
    if (!res.status) {
      trace(p.reference, `card checkout refused by Paystack: "${res.message}"`);
      await admin.rpc("fail_payment", { p_reference: p.reference, p_raw: res as never });
      return { stage: "failed", message: GENERIC_FAIL };
    }
    trace(p.reference, "card checkout ready: QR shown");
    const qrSvg = await QRCode.toString(res.data.authorization_url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1b18", light: "#ffffff" } });
    return { stage: "qr", reference: p.reference, qrSvg };
  } catch (e) {
    console.error("Paystack start failed", e);
    return { stage: "failed", message: "We could not reach the payment service. Check the connection and try again." };
  }
}

/**
 * The single place a payment becomes "paid": ask Paystack, then let the
 * database re-check amount and currency before the order reaches the kitchen.
 * Used by the kiosk's polling and by the webhook.
 */
export async function verifyAndRecord(reference: string): Promise<
  { status: "paid"; orderId: string } | { status: "pending" } | { status: "failed"; message: string }
> {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("id, status, order_id").eq("reference", reference).maybeSingle();
  if (!payment) return { status: "failed", message: GENERIC_FAIL };
  if (payment.status === "paid") return { status: "paid", orderId: payment.order_id };
  if (payment.status === "failed") return { status: "failed", message: GENERIC_FAIL };

  const res = await verifyTransaction(reference);
  if (!res.status) {
    trace(reference, `check: Paystack does not know it yet ("${res.message}")`);
    return { status: "pending" };
  }
  const tx = res.data;
  trace(reference, `check: Paystack says "${tx.status}"${tx.gateway_response ? ` (${tx.gateway_response})` : ""}`);

  if (tx.status === "success") {
    const { data, error } = await admin.rpc("confirm_payment", {
      p_reference: reference, p_amount: tx.amount, p_currency: tx.currency,
      p_provider_reference: String(tx.id), p_channel: tx.channel, p_raw: tx as never,
    });
    if (error) throw new Error(error.message); // database unreachable: caller keeps waiting
    const outcome = data as { order_id: string; error?: string };
    if (outcome.error === "ALREADY_PAID_BY_OTHER_ATTEMPT") {
      // The order is paid (by an earlier attempt): serve it. Staff see the refund flag.
      console.error("Second successful charge on a paid order, refund needed", reference);
      return { status: "paid", orderId: payment.order_id };
    }
    if (outcome.error) {
      console.error("Payment refused", reference, outcome.error);
      return { status: "failed", message: "The payment could not be matched to this order. Please ask a member of staff." };
    }
    return { status: "paid", orderId: payment.order_id };
  }
  // Only "failed" and "reversed" are final. Paystack reports "abandoned" for
  // any payment the customer has not finished yet (e.g. a card QR not yet
  // scanned), and "ongoing"/"pending" while it waits: keep waiting. The kiosk's
  // own time limit decides when to stop.
  if (tx.status === "failed" || tx.status === "reversed") {
    await admin.rpc("fail_payment", { p_reference: reference, p_raw: tx as never });
    return { status: "failed", message: friendlyFailure(tx.gateway_response) };
  }
  return { status: "pending" };
}

export async function submitPaymentOtp(reference: string, otp: string): Promise<PaymentStep> {
  try {
    const res = await paystackSubmitOtp(reference, otp);
    trace(reference, res.status ? `code accepted: Paystack says "${res.data.status}"` : `code refused: "${res.message}"`);
    // A refused code keeps the customer on the code screen; the panel keeps
    // Paystack's original instruction and shows this as an error beneath it.
    if (!res.status) return { stage: "otp", reference, message: "", error: "That code was not accepted. Check it and try again." };
    return stepFromCharge(reference, res.data, "telecel");
  } catch {
    return { stage: "failed", message: "We could not reach the payment service. Check the connection and try again." };
  }
}
