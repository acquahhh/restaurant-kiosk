"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { Button, Dialog } from "./ui";

const WARNING_SECONDS = 20;

/**
 * Returns the kiosk to the welcome screen after the configured period of no
 * touches. A warning with a countdown appears first. Never fires while a
 * payment is in progress, and does nothing on an idle welcome screen.
 */
export function InactivityGuard() {
  const { settings, state, paymentInProgress } = useKiosk();
  const router = useRouter();
  const pathname = usePathname();
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(WARNING_SECONDS);
  const lastTouch = useRef(Date.now());

  const onWelcome = pathname === "/kiosk";
  const sessionActive = !onWelcome || state.lines.length > 0 || state.orderType !== null;
  const timeoutMs = settings.kiosk_timeout_seconds * 1000;

  useEffect(() => {
    const bump = () => {
      lastTouch.current = Date.now();
    };
    window.addEventListener("pointerdown", bump, { passive: true });
    window.addEventListener("keydown", bump);
    return () => {
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, []);

  // Navigation counts as activity.
  useEffect(() => {
    lastTouch.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    if (!sessionActive || paymentInProgress) {
      setWarning(false);
      return;
    }
    const id = window.setInterval(() => {
      const idle = Date.now() - lastTouch.current;
      if (idle >= timeoutMs + WARNING_SECONDS * 1000) {
        setWarning(false);
        // The welcome screen clears the order when it mounts. Resetting here
        // first would let the current page's own guards redirect elsewhere.
        router.replace("/kiosk");
      } else if (idle >= timeoutMs) {
        setWarning(true);
        setRemaining(Math.ceil((timeoutMs + WARNING_SECONDS * 1000 - idle) / 1000));
      } else {
        setWarning(false);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [sessionActive, paymentInProgress, timeoutMs, router]);

  return (
    <Dialog open={warning} labelledBy="idle-title" className="w-[640px]">
      <div className="p-10">
        <h2 id="idle-title" className="text-4xl font-bold tracking-tight">Are you still ordering?</h2>
        <p className="mt-4 text-xl text-ink-muted">
          This order will be cleared in <span className="font-bold tabular-nums text-ink">{remaining}</span> seconds.
        </p>
        <div className="mt-10 flex gap-4">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => {
              setWarning(false);
              router.replace("/kiosk");
            }}
          >
            Start over
          </Button>
          <Button
            variant="hero"
            size="lg"
            className="flex-1"
            onClick={() => {
              lastTouch.current = Date.now();
              setWarning(false);
            }}
          >
            Keep ordering
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
