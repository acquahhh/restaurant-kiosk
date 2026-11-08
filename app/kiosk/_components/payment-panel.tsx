"use client";

import { useEffect, useRef, useState } from "react";
import type { PaymentStep } from "@/lib/kiosk/order-input";
import { formatPhone } from "@/lib/kiosk/phone";
import { formatMoney } from "@/lib/money";
import { checkPayment, submitOtp } from "../actions";
import { NumberPad } from "./keyboard";
import { Button, Dialog } from "./ui";

const POLL_MS = 3_000;
// How long to wait before offering to start again. Mobile Money prompts
// expire on the network side after a few minutes; card customers need time to scan and type.
const WAIT_LIMIT_MS = { approve: 3 * 60_000, qr: 6 * 60_000 } as const;

export function PaymentPanel({
  initial, amount, method, phone, networkLabel, onPaid, onRetry, onClose,
}: {
  initial: PaymentStep;
  amount: number;
  method: "mobile_money" | "card";
  phone: string;
  networkLabel: string;
  onPaid: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<PaymentStep>(initial);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [waitedOut, setWaitedOut] = useState(false);
  const polling = useRef(false);

  useEffect(() => setStep(initial), [initial]);
  useEffect(() => {
    if (step.stage === "paid") onPaid();
  }, [step, onPaid]);

  // Ask the server (which asks Paystack) until the payment settles.
  useEffect(() => {
    if (step.stage !== "approve" && step.stage !== "qr") return;
    setWaitedOut(false);
    const reference = step.reference;
    const started = Date.now();
    const limit = WAIT_LIMIT_MS[step.stage];
    const id = window.setInterval(async () => {
      if (Date.now() - started > limit) {
        window.clearInterval(id);
        // One last check so a payment approved at the last second is not missed.
        const last = await checkPayment(reference);
        if (last.status === "paid") setStep({ stage: "paid" });
        else setWaitedOut(true);
        return;
      }
      if (polling.current) return;
      polling.current = true;
      try {
        const r = await checkPayment(reference);
        if (r.status === "paid") setStep({ stage: "paid" });
        else if (r.status === "failed") setStep({ stage: "failed", message: r.message });
      } finally {
        polling.current = false;
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [step]);

  async function sendOtp() {
    if (step.stage !== "otp" || otp.length < 4) return;
    setBusy(true);
    const next = await submitOtp(step.reference, otp);
    setBusy(false);
    setOtp("");
    // Wrong code: keep Paystack's instruction, add the error under it.
    if (next.stage === "otp" && next.error) setStep({ ...step, error: next.error });
    else setStep(next);
  }

  const heading =
    step.stage === "paid" ? "Payment received"
    : step.stage === "failed" ? "Payment not completed"
    : waitedOut ? "We have not received the payment yet"
    : step.stage === "otp" ? "Enter your payment code"
    : step.stage === "qr" ? "Scan to pay by card"
    : "Approve the payment on your phone";

  return (
    <Dialog open labelledBy="pay-title" className="w-[68.75rem]">
      <div className="grid grid-cols-[1fr_23.75rem] portrait:grid-cols-1">
        <div className="p-12">
          <p className="text-xl font-semibold text-ink-muted">{method === "card" ? "Card payment" : networkLabel}</p>
          <h2 id="pay-title" className="mt-2 text-5xl font-bold leading-tight tracking-tight">{heading}</h2>

          {step.stage === "approve" && !waitedOut ? (
            <>
              <p className="mt-6 max-w-[34ch] text-2xl leading-snug">{step.message}</p>
              <p className="mt-8 flex items-center gap-3 text-xl font-semibold text-palm" role="status">
                <span className="h-3 w-3 animate-pulse rounded-full bg-palm" aria-hidden />
                Waiting for your approval
              </p>
            </>
          ) : null}

          {step.stage === "otp" ? (
            <div className="mt-6 flex gap-10">
              <div className="max-w-[30ch]">
                <p className="text-xl leading-snug">{step.message}</p>
                {step.error ? <p role="alert" className="mt-3 text-lg font-semibold text-pepper">{step.error}</p> : null}
                <output className="mt-6 block h-touch-lg w-[17.5rem] rounded-button border-[0.1875rem] border-palm px-5 text-4xl font-bold leading-[5.125rem] tracking-[0.3em] tabular-nums">
                  {otp}
                </output>
                <Button variant="hero" size="lg" className="mt-6 w-[17.5rem]" disabled={busy || otp.length < 4} onClick={sendOtp}>
                  {busy ? "Checking" : "Confirm code"}
                </Button>
              </div>
              <NumberPad onKey={(d) => setOtp((o) => (o.length < 8 ? o + d : o))} onBackspace={() => setOtp((o) => o.slice(0, -1))} />
            </div>
          ) : null}

          {step.stage === "qr" && !waitedOut ? (
            <div className="mt-6 flex items-center gap-10">
              <div className="h-[18.75rem] w-[18.75rem] shrink-0 rounded-card bg-white p-3 [&>svg]:h-full [&>svg]:w-full" aria-label="Payment QR code" role="img"
                dangerouslySetInnerHTML={{ __html: step.qrSvg }} />
              <ol className="list-decimal space-y-3 pl-6 text-xl leading-snug">
                <li>Open your phone camera and point it at the code.</li>
                <li>Tap the link to open the secure Paystack page.</li>
                <li>Pay by card on your phone. This screen updates by itself.</li>
              </ol>
            </div>
          ) : null}

          {step.stage === "failed" || waitedOut ? (
            <p className="mt-6 max-w-[36ch] text-2xl leading-snug">
              {step.stage === "failed"
                ? step.message
                : method === "card"
                  ? "If you have paid, wait a moment and tap Check again. Otherwise try again or choose another way to pay."
                  : "If you approved it, tap Check again. Otherwise try again or choose another way to pay."}
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col bg-sand p-10">
          <p className="text-lg text-ink-muted">Amount</p>
          <p className="price mt-1">{formatMoney(amount)}</p>
          {method === "mobile_money" ? (
            <>
              <p className="mt-6 text-lg text-ink-muted">From</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatPhone(phone)}</p>
            </>
          ) : null}
          <div className="mt-auto space-y-3 pt-10">
            {waitedOut && (step.stage === "approve" || step.stage === "qr") ? (
              <Button variant="hero" size="lg" className="w-full" onClick={() => setStep({ ...step })}>Check again</Button>
            ) : null}
            {step.stage === "failed" || waitedOut ? (
              <Button variant={waitedOut ? "secondary" : "hero"} size="lg" className="w-full" onClick={onRetry}>Try again</Button>
            ) : null}
            <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>Choose another way to pay</Button>
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
