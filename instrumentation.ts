/** Runs once when the server starts (Next.js instrumentation hook). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPaymentReconciler } = await import("@/lib/server/payment-reconciler");
    startPaymentReconciler();
  }
}
