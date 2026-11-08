import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const securityHeaders = [
  // No other site may show these pages inside a frame (stops click-tricking staff).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  // Browsers must not guess file types.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never send page addresses (which can contain order ids) to other sites.
  { key: "Referrer-Policy", value: "same-origin" },
  // The app needs none of these.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    // Only for a local test database on http://localhost; never true with Supabase (https).
    dangerouslyAllowLocalIP: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http://")),
    // Food photos and the logo are served from the Supabase "menu-images" bucket.
    remotePatterns: supabaseHost
      ? [{
          // https on Supabase; http only for a local development stack
          protocol: process.env.NEXT_PUBLIC_SUPABASE_URL!.startsWith("http://") ? "http" : "https",
          hostname: supabaseHost,
          pathname: "/storage/v1/object/public/**",
        }]
      : [],
  },
};

export default nextConfig;
