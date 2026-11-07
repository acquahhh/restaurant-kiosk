"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lineTotal } from "@/lib/kiosk/cart";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatPhone, guessNetwork, isValidGhanaPhone, NETWORK_LABEL, type MomoNetwork } from "@/lib/kiosk/phone";
import { formatGhs } from "@/lib/money";
import { placeOrder } from "../actions";
import { KioskHeader } from "../_components/kiosk-header";
import { NumberPad } from "../_components/keyboard";
import { orderTypeLabel } from "../_components/order-panel";
import { TotalsTable } from "../_components/totals";
import { Button, CheckIcon } from "../_components/ui";

type Method = "mobile_money" | "card" | "cash";

const METHOD_TEXT: Record<Method, { title: string; hint: string }> = {
  mobile_money: { title: "Mobile Money", hint: "MTN MoMo, Telecel Cash or AT Money. Approve the prompt on your phone." },
  card: { title: "Card", hint: "Scan a code with your phone and pay by card on your own screen." },
  cash: { title: "Pay at the counter", hint: "Pay with cash when you collect your order." },
};

export default function CheckoutScreen() {
  const router = useRouter();
  const {
    settings, state, hydrated, totals, ensureIdempotencyKey, setPaymentInProgress,
  } = useKiosk();

  const methods = (
    [
      settings.accept_mobile_money && "mobile_money",
      settings.accept_card && "card",
      settings.accept_cash && "cash",
    ] as const
  ).filter(Boolean) as Method[];

  const [method, setMethod] = useState<Method | null>(methods[0] ?? null);
  const [momoPhone, setMomoPhone] = useState(state.customerPhone);
  const [network, setNetwork] = useState<MomoNetwork | null>(guessNetwork(state.customerPhone));
  const [networkTouched, setNetworkTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!hydrated) return;
    if (!state.orderType) router.replace("/kiosk/order-type");
    else if (state.lines.length === 0) router.replace("/kiosk/menu");
    else ensureIdempotencyKey();
  }, [hydrated, state.orderType, state.lines.length, router, ensureIdempotencyKey]);

  // Suggest the network from the number until the customer picks one themselves.
  useEffect(() => {
    if (!networkTouched) setNetwork(guessNetwork(momoPhone));
  }, [momoPhone, networkTouched]);

  const momoReady = isValidGhanaPhone(momoPhone) && network !== null;
  const canPay = !pending && method !== null && (method !== "mobile_money" || momoReady) && Boolean(state.idempotencyKey);

  const payLabel =
    method === "mobile_money" ? `Pay ${formatGhs(totals.total)}`
    : method === "card" ? `Pay ${formatGhs(totals.total)} by card`
    : method === "cash" ? "Place order"
    : "Choose how to pay";

  function submit() {
    if (!canPay || !method) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("This kiosk has lost its internet connection. Your order is kept here. Try again in a moment.");
      return;
    }
    setError(null);
    setPaymentInProgress(true);
    startTransition(async () => {
      try {
        const result = await placeOrder({
          idempotencyKey: state.idempotencyKey,
          orderType: state.orderType,
          tableNumber: state.tableNumber,
          customerName: state.customerName,
          customerPhone: state.customerPhone,
          paymentMethod: method,
          momoNetwork: method === "mobile_money" ? network : null,
          momoPhone: method === "mobile_money" ? momoPhone : "",
          lines: state.lines.map((l) => ({
            menuItemId: l.menuItemId,
            quantity: l.quantity,
            selections: l.selections,
            instructions: l.instructions,
          })),
        });
        if (result.ok) {
          // PHASE 3/6: route to payment status, then confirmation.
          router.push(`/kiosk/confirmation/${result.orderId}`);
        } else {
          setError(result.message);
        }
      } catch {
        setError("The order could not be sent. Check the connection and try again.");
      } finally {
        setPaymentInProgress(false);
      }
    });
  }

  if (!hydrated || state.lines.length === 0) return null;

  return (
    <>
      <KioskHeader backHref="/kiosk/cart" backLabel="Order" title="Checkout" />

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto px-12 py-8">
          <h2 className="text-3xl font-bold tracking-tight">How would you like to pay?</h2>
          {methods.length === 0 ? (
            <p className="mt-6 text-xl font-semibold text-pepper">
              Payments are switched off on this kiosk. Please order at the counter.
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-3 gap-5">
            {methods.map((m) => {
              const selected = method === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setMethod(m);
                    setError(null);
                  }}
                  className={`flex min-h-[180px] flex-col rounded-card border-[3px] p-7 text-left transition-colors duration-150 ${
                    selected ? "border-palm bg-palm-soft" : "border-sand-deep active:bg-sand"
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-3xl font-bold tracking-tight">{METHOD_TEXT[m].title}</span>
                    <span className={`grid h-10 w-10 place-items-center rounded-full border-[3px] ${
                      selected ? "border-palm bg-palm text-white" : "border-sand-deep"
                    }`}>
                      {selected ? <CheckIcon className="h-5 w-5" /> : null}
                    </span>
                  </span>
                  <span className="mt-3 text-lg leading-snug text-ink-muted">{METHOD_TEXT[m].hint}</span>
                </button>
              );
            })}
          </div>

          {method === "mobile_money" ? (
            <section className="mt-10 flex gap-12" aria-label="Mobile Money details">
              <div className="w-[480px] shrink-0">
                <label className="block">
                  <span className="text-2xl font-semibold">Mobile Money number</span>
                  <input
                    readOnly
                    inputMode="none"
                    value={formatPhone(momoPhone)}
                    className="mt-3 h-touch-lg w-full rounded-button border-[3px] border-palm bg-canvas px-5 text-4xl font-bold tabular-nums tracking-wide outline-none"
                    aria-describedby="momo-help"
                  />
                </label>
                <p id="momo-help" className={`mt-2 text-lg ${momoPhone.length === 10 && !isValidGhanaPhone(momoPhone) ? "font-semibold text-pepper" : "text-ink-muted"}`}>
                  {momoPhone.length === 10 && !isValidGhanaPhone(momoPhone)
                    ? "That number is not a Ghana mobile number."
                    : "The phone that will receive the payment prompt."}
                </p>

                <h3 className="mt-8 text-2xl font-semibold">Network</h3>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(Object.keys(NETWORK_LABEL) as MomoNetwork[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={network === n}
                      onClick={() => {
                        setNetwork(n);
                        setNetworkTouched(true);
                      }}
                      className={`min-h-touch-lg rounded-button border-[3px] px-3 text-lg font-semibold leading-tight ${
                        network === n ? "border-palm bg-palm-soft" : "border-sand-deep active:bg-sand"
                      }`}
                    >
                      {NETWORK_LABEL[n]}
                    </button>
                  ))}
                </div>
              </div>
              <NumberPad
                onKey={(d) => setMomoPhone((p) => (p.length < 10 ? p + d : p))}
                onBackspace={() => setMomoPhone((p) => p.slice(0, -1))}
              />
            </section>
          ) : null}

          {method === "card" ? (
            <p className="mt-10 max-w-[52ch] text-xl leading-relaxed text-ink-muted">
              After you tap Pay, a code appears on this screen. Point your phone camera at it to open a secure
              Paystack page and pay by card. This screen updates as soon as the payment goes through.
            </p>
          ) : null}

          {method === "cash" ? (
            <p className="mt-10 max-w-[52ch] text-xl leading-relaxed text-ink-muted">
              Your order goes to the kitchen now. Pay at the counter with your order number.
            </p>
          ) : null}
        </main>

        <aside className="flex w-[520px] shrink-0 flex-col border-l border-sand-deep bg-sand px-10 py-8">
          <h2 className="text-2xl font-semibold">{orderTypeLabel(state.orderType, state.tableNumber, state.customerName)}</h2>
          <ul className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto text-xl">
            {state.lines.map((l) => (
              <li key={l.lineId} className="flex justify-between gap-4">
                <span>
                  <span className="font-semibold tabular-nums">{l.quantity} × </span>
                  {l.name}
                </span>
                <span className="shrink-0 tabular-nums">{formatGhs(lineTotal(l))}</span>
              </li>
            ))}
          </ul>
          <div className="pt-6">
            <TotalsTable />
            {error ? (
              <p role="alert" className="mt-5 rounded-button bg-pepper-soft px-5 py-4 text-lg font-semibold text-pepper">
                {error}
              </p>
            ) : null}
            <Button variant="hero" size="lg" className="mt-6 w-full" disabled={!canPay} onClick={submit}>
              {pending ? "Sending your order" : payLabel}
            </Button>
          </div>
        </aside>
      </div>
    </>
  );
}
