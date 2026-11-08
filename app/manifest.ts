import type { MetadataRoute } from "next";

/**
 * Lets an Android tablet "install" the kiosk: it then opens full screen with
 * no browser bars, straight onto the welcome screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Order here",
    short_name: "Order",
    description: "Self-service ordering",
    start_url: "/kiosk",
    scope: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: "#16603a",
    theme_color: "#16603a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
