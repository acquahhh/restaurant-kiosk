import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
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
