"use client";

import { useEffect, useState } from "react";
import { openState } from "@/lib/kiosk/opening-hours";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatGhs } from "@/lib/money";
import { Button } from "./_components/ui";
import { FoodImage } from "./_components/food-image";
import { enterFullscreen } from "./_components/device-guard";

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

  const featured = menu.flatMap((c) => c.items).filter((i) => i.is_featured && i.is_available).slice(0, 3);
  const heroPhoto = featured.find((i) => i.image_url)?.image_url ?? null;

  return (
    <main
      className="grid h-full grid-cols-[1.15fr_1fr] portrait:grid-cols-1 portrait:grid-rows-[1.25fr_1fr]"
      onClick={() => {
        if (closed) return;
        enterFullscreen();
        router.push("/kiosk/order-type");
      }}
    >
      <section className="flex flex-col justify-between bg-palm px-20 py-16 text-white portrait:px-14 portrait:py-12">
        <div className="flex items-center gap-5">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt="" className="h-16 w-16 rounded-full bg-white object-contain" />
          ) : null}
          <span className="text-3xl font-extrabold tracking-tight">{settings.name}</span>
        </div>

        <div>
          <h1 className="max-w-[10ch] text-[7.5rem] font-extrabold leading-[0.92] tracking-[-0.035em]">
            {settings.tagline ?? "Order here"}
          </h1>
          <p className="mt-8 max-w-[34ch] text-2xl leading-snug text-white/80">
            Order and pay here. We bring dine-in orders to your table.
          </p>
        </div>

        {closed ? (
          <div className="max-w-[35rem] rounded-button bg-white/10 px-8 py-6">
            <p className="text-3xl font-bold">We are closed right now</p>
            {hours?.opensAt ? <p className="mt-2 text-2xl text-white/80">We open {hours.opensAt}.</p> : null}
          </div>
        ) : (
        <Button
          variant="hero"
          size="xl"
          className="w-full max-w-[35rem]"
          onClick={(e) => {
            e.stopPropagation();
            enterFullscreen();
            router.push("/kiosk/order-type");
          }}
        >
          Start order
        </Button>
        )}
      </section>

      <section className="relative flex flex-col bg-sand">
        {heroPhoto ? (
          <FoodImage src={heroPhoto} alt="" sizes="45vw" className="absolute inset-0" />
        ) : (
          <div className="flex h-full flex-col justify-center px-16 portrait:px-14">
            <h2 className="text-2xl font-semibold text-ink-muted">Today’s favourites</h2>
            <ul className="mt-8 divide-y divide-sand-deep border-y border-sand-deep">
              {featured.map((item) => (
                <li key={item.id} className="py-8">
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-4xl font-bold leading-tight tracking-tight">{item.name}</span>
                    <span className="shrink-0 text-2xl font-bold tabular-nums">{formatGhs(item.base_price)}</span>
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
