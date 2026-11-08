/** Dates and times in the restaurant's own time zone (not the server's or UTC). */
import { COUNTRY } from "./countries";

/** "2026-11-08" for the restaurant's current calendar day (or `date`). */
export function localDate(date: Date = new Date(), timeZone = COUNTRY.timeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Day of week (Monday = 0) and minutes since midnight, in the restaurant's time zone. */
export function localDayAndMinutes(date: Date = new Date(), timeZone = COUNTRY.timeZone): { day: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!);
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** A calendar date `days` before `isoDate` (both YYYY-MM-DD). */
export function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function formatTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString(COUNTRY.locale, { hour: "2-digit", minute: "2-digit", timeZone: COUNTRY.timeZone });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(COUNTRY.locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: COUNTRY.timeZone });
}
