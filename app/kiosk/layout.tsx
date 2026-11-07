import type { Metadata } from "next";
import { KioskProvider } from "@/lib/kiosk/kiosk-session";
import { fixtureMenu, fixtureSettings, fixtureTables } from "@/lib/kiosk/fixture-menu";
import { InactivityGuard } from "./_components/inactivity-guard";

export const metadata: Metadata = { title: "Order here" };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  // PHASE 3: replace fixtures with a cached Supabase loader (menu, settings, tables).
  return (
    <KioskProvider settings={fixtureSettings} menu={fixtureMenu} tables={fixtureTables}>
      <div data-surface="kiosk" className="fixed inset-0 flex flex-col overflow-hidden bg-canvas">
        {children}
      </div>
      <InactivityGuard />
    </KioskProvider>
  );
}
