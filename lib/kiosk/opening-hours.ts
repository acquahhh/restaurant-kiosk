/** Opening hours stored as {"mon":{"open":"08:00","close":"22:00"}, "sun": null, ...}. Ghana is GMT all year. */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export type Hours = Partial<Record<Day, { open: string; close: string } | null>>;
export const DAY_LABEL: Record<Day, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Returns null when hours are not configured (the kiosk is then always open). */
export function openState(hours: unknown, now = new Date()): { open: boolean; opensAt?: string } | null {
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return null;
  const h = hours as Hours;
  const dayIndex = (now.getUTCDay() + 6) % 7; // Monday = 0
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const today = h[DAYS[dayIndex]!];
  if (today) {
    const o = toMinutes(today.open), c = toMinutes(today.close);
    const open = c > o ? minutes >= o && minutes < c : minutes >= o || minutes < c; // closes after midnight
    if (open) return { open: true };
    if (minutes < o) return { open: false, opensAt: `today at ${today.open}` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = DAYS[(dayIndex + i) % 7]!;
    const next = h[d];
    if (next) return { open: false, opensAt: i === 1 ? `tomorrow at ${next.open}` : `${DAY_LABEL[d]} at ${next.open}` };
  }
  return { open: false };
}
