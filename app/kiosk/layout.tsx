import type { Metadata } from "next";
import { loadKioskData } from "@/lib/db/load-menu";
import { BrandStyle } from "../brand-style";
import { countryMismatch } from "@/lib/country-check";
import { KioskProvider } from "@/lib/kiosk/kiosk-session";
import { DeviceGuard } from "./_components/device-guard";
import { InactivityGuard } from "./_components/inactivity-guard";
import { ScreenTransition } from "./_components/screen-transition";

export const metadata: Metadata = { title: "Order here" };

// Read the menu on every full page load so admin changes reach the kiosk.
// Live updates without a reload arrive with Realtime in Phase 5.
export const dynamic = "force-dynamic";

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const { settings, menu, tables, source } = await loadKioskData();
  const mismatch = countryMismatch(settings);
  if (mismatch) {
    return (
      <main data-surface="kiosk" className="fixed inset-0 grid place-items-center bg-sand p-16">
        <div className="max-w-[48rem] rounded-panel bg-canvas p-12">
          <h1 className="text-4xl font-bold tracking-tight">This kiosk is not ready</h1>
          <p className="mt-4 text-2xl text-ink-muted">Please order at the counter.</p>
          <p className="mt-8 rounded-button bg-pepper-soft p-5 text-lg font-semibold text-pepper">For staff: {mismatch}</p>
        </div>
      </main>
    );
  }
  return (
    <KioskProvider settings={settings} menu={menu} tables={tables}>
      <BrandStyle primary={settings.brand_primary} accent={settings.brand_accent} />
      <div data-surface="kiosk" className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
        <ScreenTransition>{children}</ScreenTransition>
      </div>
      {source === "fixture" ? (
        <div className="pointer-events-none fixed bottom-3 left-3 z-[60] rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white">
          Development menu: database not connected
        </div>
      ) : null}
      <InactivityGuard />
      <DeviceGuard />
    </KioskProvider>
  );
}
