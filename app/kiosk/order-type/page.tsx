"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useKiosk, type OrderType } from "@/lib/kiosk/kiosk-session";
import { formatPhone, isValidPhone, phoneLength } from "@/lib/kiosk/phone";
import { COUNTRY } from "@/lib/countries";
import { KioskHeader } from "../_components/kiosk-header";
import { LetterKeyboard, NumberPad, tidyName } from "../_components/keyboard";
import { Button, CheckIcon } from "../_components/ui";

const NAME_MAX = 30;


export default function OrderTypeScreen() {
  const router = useRouter();
  const { state, tables, setDineIn, setTakeaway } = useKiosk();

  const [type, setType] = useState<OrderType | null>(state.orderType);
  const [table, setTable] = useState<string | null>(state.tableNumber);
  const [name, setName] = useState(state.customerName);
  const [phone, setPhone] = useState(state.customerPhone);
  const [field, setField] = useState<"name" | "phone">("name");
  const [showErrors, setShowErrors] = useState(false);

  const nameOk = name.trim().length >= 2;
  const phoneOk = phone === "" || isValidPhone(phone);
  const canContinue = type === "dine_in" ? table !== null : type === "takeaway" ? nameOk && phoneOk : false;

  function proceed() {
    if (!canContinue) {
      setShowErrors(true);
      return;
    }
    if (type === "dine_in" && table) setDineIn(table);
    if (type === "takeaway") setTakeaway(name.trim(), phone);
    router.push("/kiosk/menu");
  }

  return (
    <>
      <KioskHeader backHref="/kiosk" title="Where will you eat?" />

      <main className="flex min-h-0 flex-1 flex-col px-12 pb-10 pt-8">
        <div className="grid grid-cols-2 gap-6">
          {(
            [
              ["dine_in", "Dine in", "We bring your food to your table."],
              ["takeaway", "Takeaway", "Collect your order at the counter."],
            ] as const
          ).map(([value, title, hint]) => {
            const selected = type === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setType(value);
                  setShowErrors(false);
                }}
                className={`flex min-h-[9.25rem] items-center justify-between rounded-card border-[0.1875rem] px-10 text-left transition-colors duration-150 ${
                  selected ? "border-palm bg-palm-soft" : "border-sand-deep bg-canvas active:bg-sand"
                }`}
              >
                <span>
                  <span className="block text-4xl font-bold tracking-tight">{title}</span>
                  <span className="mt-2 block text-xl text-ink-muted">{hint}</span>
                </span>
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-[0.1875rem] ${
                    selected ? "border-palm bg-palm text-white" : "border-sand-deep"
                  }`}
                >
                  {selected ? <CheckIcon /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 pt-10">
          {type === "dine_in" ? (
            <section aria-labelledby="table-heading">
              <h2 id="table-heading" className="text-2xl font-semibold">
                Your table number
              </h2>
              <p className="mt-1 text-xl text-ink-muted">It is printed on the stand on your table.</p>
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-4">
                {tables.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={table === t}
                    onClick={() => setTable(t)}
                    className={`h-[5.5rem] rounded-button text-3xl font-bold tabular-nums transition-colors duration-100 ${
                      table === t ? "bg-palm text-white" : "bg-sand active:bg-sand-deep"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {showErrors && !table ? <p className="mt-4 text-xl font-semibold text-pepper">Choose your table number.</p> : null}
            </section>
          ) : null}

          {type === "takeaway" ? (
            <section className="flex h-full gap-10 portrait:flex-col portrait:gap-6" aria-label="Your details">
              <div className="w-[26.25rem] shrink-0 space-y-6 portrait:grid portrait:w-full portrait:grid-cols-2 portrait:gap-6 portrait:space-y-0">
                <label className="block" onClick={() => setField("name")}>
                  <span className="text-2xl font-semibold">Your name</span>
                  <span className="mt-1 block text-lg text-ink-muted">We call it when your order is ready.</span>
                  <input
                    readOnly
                    inputMode="none"
                    value={name}
                    onFocus={() => setField("name")}
                    className={`mt-3 h-touch-lg w-full rounded-button border-[0.1875rem] bg-canvas px-5 text-3xl font-semibold outline-none ${
                      field === "name" ? "border-palm" : "border-sand-deep"
                    }`}
                  />
                  {showErrors && !nameOk ? (
                    <span className="mt-2 block text-lg font-semibold text-pepper">Enter at least 2 letters.</span>
                  ) : null}
                </label>

                <label className="block" onClick={() => setField("phone")}>
                  <span className="text-2xl font-semibold">Phone number</span>
                  <span className="mt-1 block text-lg text-ink-muted">Optional. For a text when your order is ready.</span>
                  <input
                    readOnly
                    inputMode="none"
                    value={formatPhone(phone)}
                    onFocus={() => setField("phone")}
                    className={`mt-3 h-touch-lg w-full rounded-button border-[0.1875rem] bg-canvas px-5 text-3xl font-semibold tabular-nums outline-none ${
                      field === "phone" ? "border-palm" : "border-sand-deep"
                    }`}
                  />
                  {!phoneOk && (showErrors || phone.length >= phoneLength()) ? (
                    <span className="mt-2 block text-lg font-semibold text-pepper">Enter a mobile number like {COUNTRY.phone.example}.</span>
                  ) : null}
                </label>
              </div>

              <div className="flex flex-1 items-start justify-center portrait:flex-none">
                {field === "name" ? (
                  <LetterKeyboard
                    extraKeys={["-", "'"]}
                    onKey={(k) => setName((n) => (n.length < NAME_MAX ? tidyName(n + k) : n))}
                    onSpace={() => setName((n) => (n && !n.endsWith(" ") && n.length < NAME_MAX ? n + " " : n))}
                    onBackspace={() => setName((n) => n.slice(0, -1))}
                    onDone={() => setField("phone")}
                    doneLabel="Next"
                  />
                ) : (
                  <NumberPad
                    onKey={(d) => setPhone((p) => (p.length < phoneLength() ? p + d : p))}
                    onBackspace={() => setPhone((p) => p.slice(0, -1))}
                  />
                )}
              </div>
            </section>
          ) : null}

          {type === null ? (
            <p className="text-xl text-ink-muted">Choose dine in or takeaway to continue.</p>
          ) : null}
        </div>

        <div className="flex justify-end pt-6">
          <Button variant="hero" size="lg" className="w-[26.25rem]" onClick={proceed} disabled={type === null}>
            See the menu
          </Button>
        </div>
      </main>
    </>
  );
}
