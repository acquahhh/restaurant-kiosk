import { brandCss } from "@/lib/branding";

/** Re-themes the page in the restaurant's colours (server-rendered, no flash). */
export function BrandStyle({ primary, accent }: { primary?: string | null; accent?: string | null }) {
  return <style dangerouslySetInnerHTML={{ __html: brandCss({ primary: primary ?? undefined, accent: accent ?? undefined }) }} />;
}
