import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServerWriteConfigured } from "@/lib/supabase/config";
import { isPaystackConfigured } from "@/lib/paystack";
import { verifyAndRecord } from "@/lib/kiosk/payments";

/**
 * When the app runs only inside the restaurant, Paystack's webhook cannot reach
 * it. This loop does the webhook's job: every 30 seconds it asks Paystack about
 * any Paystack payment from the last 30 minutes that is still pending, and
 * records it (sending the order to the kitchen) if it went through.
 * This catches a customer who paid but walked away before the kiosk confirmed.
 */
const INTERVAL_MS = 30_000;
const LOOKBACK_MINUTES = 30;

async function tick() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("payments_to_reconcile", { p_minutes: LOOKBACK_MINUTES });
  if (error) {
    console.error("[reconcile] could not list pending payments:", error.message);
    return;
  }
  for (const { reference } of data ?? []) {
    try {
      const result = await verifyAndRecord(reference);
      if (result.status === "paid") console.info(`[reconcile] ${reference} confirmed in the background`);
    } catch (e) {
      console.error(`[reconcile] ${reference} check failed`, e);
    }
  }
  // After reconciling, cancel orders nobody paid for.
  await admin.rpc("expire_unpaid_orders", { p_minutes: 20 });
}

export function startPaymentReconciler() {
  const g = globalThis as typeof globalThis & { __reconcilerStarted?: boolean };
  if (g.__reconcilerStarted) return; // once per server process (dev reloads too)
  if (!isServerWriteConfigured() || !isPaystackConfigured()) return;
  g.__reconcilerStarted = true;
  let running = false;
  setInterval(async () => {
    if (running) return; // never overlap on a slow connection
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  }, Number(process.env.RECONCILE_INTERVAL_MS) || INTERVAL_MS);
  console.info("[reconcile] background payment checks every", (Number(process.env.RECONCILE_INTERVAL_MS) || INTERVAL_MS) / 1000, "s");
}
