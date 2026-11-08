"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { BackIcon, Button, Dialog } from "./ui";

export function KioskHeader({
  backHref, backLabel = "Back", title, right,
}: {
  backHref?: string;
  backLabel?: string;
  title?: string;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const { settings, state } = useKiosk();
  const [confirm, setConfirm] = useState(false);
  const hasProgress = state.lines.length > 0 || state.orderType !== null;

  return (
    <header className="flex h-24 shrink-0 items-center gap-6 border-b border-sand-deep px-8">
      {backHref ? (
        <Button variant="ghost" onClick={() => router.push(backHref)} className="-ml-3 pl-3 pr-5">
          <BackIcon />
          {backLabel}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="truncate text-3xl font-bold tracking-tight">{title}</h1>
        ) : (
          <span className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logo_url} alt="" className="h-11 w-11 rounded-full object-contain" />
            ) : (
              <span className="h-3 w-3 rounded-full bg-plantain" aria-hidden />
            )}
            {settings.name}
          </span>
        )}
      </div>
      {right}
      <Button
        variant="ghost"
        className="text-ink-muted"
        onClick={() => (hasProgress ? setConfirm(true) : router.push("/kiosk"))}
      >
        Start over
      </Button>

      <Dialog open={confirm} onClose={() => setConfirm(false)} labelledBy="restart-title" className="w-[37.5rem]">
        <div className="p-10">
          <h2 id="restart-title" className="text-4xl font-bold tracking-tight">Start a new order?</h2>
          <p className="mt-4 text-xl text-ink-muted">Everything in this order will be removed.</p>
          <div className="mt-10 flex gap-4">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setConfirm(false)}>
              Keep this order
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1 bg-pepper active:bg-pepper"
              onClick={() => {
                setConfirm(false);
                // Welcome screen clears the order on arrival (avoids a redirect race).
                router.replace("/kiosk");
              }}
            >
              Start over
            </Button>
          </div>
        </div>
      </Dialog>
    </header>
  );
}
