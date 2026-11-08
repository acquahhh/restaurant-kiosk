"use client";

import { useEffect, useState } from "react";
import { openState } from "@/lib/kiosk/opening-hours";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatMoney } from "@/lib/money";
import { Button } from "./_components/ui";
import { FoodImage } from "./_components/food-image";
import { enterFullscreen } from "./_components/device-guard";
import { COUNTRY } from "@/lib/countries";

export default function WelcomeScreen() {
  const router = useRouter();
  const { settings, menu, reset, state, hydrated } = useKiosk();

  // Single place an order is cleared: arriving here (start over, idle reset).
  useEffect(() => {
    if (hydrated && (state.lines.length > 0 || state.orderType)) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    router.prefetch("/kiosk/order-type");
    router.prefetch("/kiosk/menu");
  }, [router]);

  // Re-check every minute so the kiosk opens and closes on its own.
  const [hours, setHours] = useState(() => openState(settings.opening_hours));
  useEffect(() => {
    const id = window.setInterval(() => setHours(openState(settings.opening_hours)), 60_000);
    return () => window.clearInterval(id);
  }, [settings.opening_hours]);
  const closed = hours !== null && !hours.open;

  const allItems = menu.flatMap((c) => c.items).filter((i) => i.is_available);
  const featured = allItems.filter((i) => i.is_featured).slice(0, 3);
  // Photos for the right-hand panel: featured first, then popular dishes.
  const photoItems = [...allItems.filter((i) => i.is_featured), ...allItems.filter((i) => i.is_popular && !i.is_featured)]
    .filter((i) => i.image_url).slice(0, 5);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (photoItems.length < 2) return;
    const id = window.setInterval(() => setSlide((n) => (n + 1) % photoItems.length), 6000);
    return () => window.clearInterval(id);
  }, [photoItems.length]);

  const payWith = [
    settings.accept_mobile_money && COUNTRY.mobileMoney.ready && "Mobile Money",
    settings.accept_card && COUNTRY.card.ready && "Card",
    settings.accept_cash && "Cash at the counter",
  ].filter(Boolean) as string[];

  const start = () => {
    if (closed) return;
    enterFullscreen();
    router.push("/kiosk/order-type");
  };

  return (
    <main className="grid h-full grid-cols-[1.15fr_1fr] portrait:grid-cols-1 portrait:grid-rows-[1.25fr_1fr]" onClick={start}>
      <section className="relative isolate flex flex-col justify-between overflow-hidden bg-palm px-20 py-16 text-white portrait:px-14 portrait:py-12">
        {/* Soft shapes in the restaurant's colours, drifting slowly behind the text */}
        <span aria-hidden className="absolute -right-[16rem] -top-[16rem] -z-10 h-[44rem] w-[44rem] rounded-full border-[3rem] border-white/[0.06] animate-[drift_18s_ease-in-out_infinite_alternate]" />
        <span aria-hidden className="absolute -bottom-[20rem] -left-[12rem] -z-10 h-[40rem] w-[40rem] rounded-full bg-white/[0.06] animate-[drift_24s_ease-in-out_infinite_alternate-reverse]" />

        <div className="flex items-center gap-5 animate-[rise_500ms_cubic-bezier(0.22,1,0.36,1)_both]">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="" className="h-20 w-20 rounded-full bg-white object-contain p-1.5 shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.2)]" />
          ) : null}
          <span className="text-3xl font-extrabold tracking-tight">{settings.name}</span>
        </div>

        <div>
          <h1 className="max-w-[10ch] text-[7.5rem] font-extrabold leading-[0.92] tracking-[-0.035em] animate-[rise_650ms_120ms_cubic-bezier(0.22,1,0.36,1)_both]">
            {settings.tagline ?? "Order here"}
          </h1>
          <p className="mt-8 max-w-[34ch] text-2xl leading-snug text-white/80 animate-[rise_650ms_220ms_cubic-bezier(0.22,1,0.36,1)_both]">
            Order and pay here. We bring dine-in orders to your table.
          </p>
        </div>

        <div className="animate-[rise_650ms_320ms_cubic-bezier(0.22,1,0.36,1)_both]">
          {closed ? (
            <div className="max-w-[35rem] rounded-button bg-white/10 px-8 py-6">
              <p className="text-3xl font-bold">We are closed right now</p>
              {hours?.opensAt ? <p className="mt-2 text-2xl text-white/80">We open {hours.opensAt}.</p> : null}
            </div>
          ) : (
            <Button
              variant="hero"
              size="xl"
              className="w-full max-w-[35rem] shadow-[0_1rem_2.5rem_rgba(0,0,0,0.25)] animate-[breathe_3.2s_ease-in-out_infinite]"
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
            >
              Start order
            </Button>
          )}
          {payWith.length > 0 && !closed ? (
            <p className="mt-6 flex flex-wrap items-center gap-2 text-lg text-white/75">
              <span>Pay with</span>
              {payWith.map((p) => (
                <span key={p} className="rounded-full border border-white/25 px-3 py-1 font-semibold text-white">{p}</span>
              ))}
            </p>
          ) : null}
        </div>
      </section>

      <section className="relative overflow-hidden bg-sand">
        {photoItems.length > 0 ? (
          <>
            {photoItems.map((item, i) => (
              <div key={item.id} className={`absolute inset-0 transition-opacity duration-[1400ms] ease-in-out ${i === slide ? "opacity-100" : "opacity-0"}`} aria-hidden={i !== slide}>
                <FoodImage src={item.image_url} alt={item.name} sizes="45vw" className={`absolute inset-0 ${i === slide ? "scale-105" : "scale-100"} transition-transform duration-[7000ms] ease-out`} />
                <div className="absolute inset-x-8 bottom-8 flex items-end justify-between gap-6 rounded-card bg-ink/70 px-7 py-5 text-white backdrop-blur-sm">
                  <span className="text-3xl font-bold leading-tight tracking-tight">{item.name}</span>
                  <span className="shrink-0 rounded-full bg-plantain px-4 py-1.5 text-2xl font-extrabold tabular-nums text-ink">{formatMoney(item.base_price)}</span>
                </div>
              </div>
            ))}
            {photoItems.length > 1 ? (
              <div className="absolute right-10 top-8 flex gap-2" aria-hidden>
                {photoItems.map((item, i) => (
                  <span key={item.id} className={`h-2 rounded-full bg-white transition-all duration-500 ${i === slide ? "w-8" : "w-2 opacity-50"}`} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col justify-center px-16 portrait:px-14">
            <h2 className="text-2xl font-semibold text-ink-muted">Today’s favourites</h2>
            <ul className="mt-8 divide-y divide-sand-deep border-y border-sand-deep">
              {featured.map((item, i) => (
                <li key={item.id} className="py-8 animate-[rise_600ms_cubic-bezier(0.22,1,0.36,1)_both]" style={{ animationDelay: `${250 + i * 120}ms` }}>
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-4xl font-bold leading-tight tracking-tight">{item.name}</span>
                    <span className="shrink-0 rounded-full bg-palm px-4 py-1 text-2xl font-bold tabular-nums text-white">{formatMoney(item.base_price)}</span>
                  </div>
                  <p className="mt-3 max-w-[44ch] text-xl text-ink-muted">{item.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
