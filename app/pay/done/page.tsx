export const metadata = { title: "Payment" };

/**
 * Where Paystack sends the customer's phone after a card payment. The kiosk
 * confirms the payment itself; this page only tells the customer what next.
 */
export default function PaymentDonePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-6">
      <div className="max-w-sm rounded-panel bg-canvas p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Thank you</h1>
        <p className="mt-3 text-lg text-ink-muted">
          Look at the kiosk screen. It shows your order number as soon as the payment is confirmed.
        </p>
        <p className="mt-6 text-sm text-ink-muted">You can close this page.</p>
      </div>
    </main>
  );
}
