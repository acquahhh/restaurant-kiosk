import type { Metadata, Viewport } from "next";
// Self-hosted so the kiosk keeps its typeface with no internet connection.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant Ordering",
  description: "Self-service ordering, kitchen display and restaurant management.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom is disabled on purpose: this runs on a locked kiosk touchscreen.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
