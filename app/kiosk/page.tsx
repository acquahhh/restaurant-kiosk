"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { formatGhs } from "@/lib/money";
import { Button } from "./_components/ui";
import { FoodImage } from "./_components/food-image";

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

  const featured = menu.flatMap((c) => c.items).filter((i) => i.is_featured && i.is_available).slice(0, 3);
  const heroPhoto = featured.find((i) => i.image_url)?.image_url ?? null;

  return (
    <main
      className="grid h-full grid-cols-[1.15fr_1fr]"
      onClick={() => router.push("/kiosk/order-type")}
    >
      <section className="flex flex-col justify-between bg-palm px-20 py-16 text-white">
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

        <Button
          variant="hero"
          size="xl"
          className="w-full max-w-[560px]"
          onClick={(e) => {
            e.stopPropagation();
            router.push("/kiosk/order-type");
          }}
        >
          Start order
        </Button>
      </section>

      <section className="relative flex flex-col bg-sand">
        {heroPhoto ? (
          <FoodImage src={heroPhoto} alt="" sizes="45vw" className="absolute inset-0" />
        ) : (
          <div className="flex h-full flex-col justify-center px-16">
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
