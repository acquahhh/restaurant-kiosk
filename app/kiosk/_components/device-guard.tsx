"use client";

import { useEffect } from "react";

/**
 * Kiosk hardware conveniences that work on any device:
 * - Keeps the screen awake (Screen Wake Lock), re-acquired whenever the page
 *   becomes visible again; tablets otherwise dim and lock after a minute.
 * - Blocks the long-press context menu and pinch/double-tap zoom gestures.
 * Fullscreen is requested from the Start order button (browsers only allow it
 * after a tap); a kiosk browser that is already fullscreen ignores it.
 */
export function DeviceGuard() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") lock = await nav.wakeLock.request("screen");
      } catch {
        // Not supported (older browsers) or denied: the device's own sleep setting applies.
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void wake();
    const noMenu = (e: Event) => e.preventDefault();
    const noPinch = (e: TouchEvent) => e.touches.length > 1 && e.preventDefault();

    void wake();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("contextmenu", noMenu);
    document.addEventListener("touchmove", noPinch, { passive: false });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("contextmenu", noMenu);
      document.removeEventListener("touchmove", noPinch);
      void lock?.release().catch(() => {});
    };
  }, []);
  return null;
}

/** Call from a tap handler. Safe everywhere: does nothing if already fullscreen or unsupported. */
export function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}
