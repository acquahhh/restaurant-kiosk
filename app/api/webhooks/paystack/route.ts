import { NextResponse } from "next/server";
import { isValidWebhookSignature } from "@/lib/paystack";
import { verifyAndRecord } from "@/lib/kiosk/payments";

/**
 * Paystack → POST /api/webhooks/paystack
 * Set this URL in Paystack: Settings → API Keys & Webhooks → Webhook URL
 * (needs a public address, so it works once the app is deployed).
 *
 * The kiosk also polls, so a missed webhook never loses a payment; this makes
 * sure a payment is recorded even if the kiosk lost its connection mid-payment.
 * The event body is only a hint: we always re-verify with Paystack.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!isValidWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const reference = event.data?.reference;
  if ((event.event === "charge.success" || event.event === "charge.failed") && reference) {
    try {
      await verifyAndRecord(reference);
    } catch (e) {
      console.error("webhook verify failed", reference, e);
      // 500 makes Paystack retry later.
      return NextResponse.json({ error: "retry" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true });
}
