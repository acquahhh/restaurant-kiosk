/**
 * Restaurant colours → the CSS variables every screen is built on.
 * primary: buttons, selected states, the welcome panel (white text on it).
 * accent:  the one hero button per screen, highlights (dark text on it).
 */

export interface Brand {
  primary: string;
  accent: string;
}

export const DEFAULT_BRAND: Brand = { primary: "#16603a", accent: "#f2b134" };

/** Ready-made palettes; all pass the readability checks below. */
export const BRAND_PRESETS: Array<Brand & { name: string }> = [
  { name: "Palm and plantain", primary: "#16603a", accent: "#f2b134" },
  { name: "Atlantic", primary: "#0b4f71", accent: "#f6c453" },
  { name: "Kente", primary: "#1f3b2d", accent: "#f4b400" },
  { name: "Pepper", primary: "#a4161a", accent: "#ffd166" },
  { name: "Cocoa", primary: "#4a2c1d", accent: "#f2a65a" },
  { name: "Night market", primary: "#1d1b3a", accent: "#ff9f1c" },
  { name: "Lagoon", primary: "#0f5e57", accent: "#ffcf56" },
  { name: "Plum", primary: "#5b2a5e", accent: "#f7b32b" },
];

const HEX = /^#[0-9a-f]{6}$/i;

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}
/** Blend toward another colour: amount 0 = unchanged, 1 = fully the other colour. */
export function mix(hex: string, withHex: string, amount: number): string {
  const a = toRgb(hex), b = toRgb(withHex);
  return toHex([0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * amount) as [number, number, number]);
}

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const INK = "#1c1b18";

/**
 * Readability rules for a kiosk read from a step back:
 * white text on the main colour, dark text on the accent, both at least 4.5:1.
 */
export function checkBrand(b: Brand): string | null {
  if (!HEX.test(b.primary) || !HEX.test(b.accent)) return "Choose colours as #RRGGBB.";
  if (contrast(b.primary, "#ffffff") < 4.5) return "The main colour is too light: white text on it would be hard to read. Choose a darker shade.";
  if (contrast(b.accent, INK) < 4.5) return "The accent colour is too dark: the dark text on its buttons would be hard to read. Choose a lighter shade.";
  return null;
}

/** CSS that re-themes every screen (overrides the defaults in globals.css). */
export function brandCss(input: Partial<Brand> | null | undefined): string {
  const b = { ...DEFAULT_BRAND, ...(input ?? {}) };
  const safe = checkBrand(b) ? DEFAULT_BRAND : b; // never render unreadable colours
  return `:root{--color-palm:${safe.primary};--color-palm-deep:${mix(safe.primary, "#000000", 0.25)};--color-palm-soft:${mix(safe.primary, "#ffffff", 0.88)};--color-plantain:${safe.accent};--color-plantain-deep:${mix(safe.accent, "#000000", 0.12)};--color-brand-glow:${mix(safe.accent, "#ffffff", 0.35)}}`;
}
