import { COUNTRY } from "./countries";

/**
 * The installation's country (NEXT_PUBLIC_COUNTRY, used to show money and
 * phone numbers) must match the database's (used for the calendar day and
 * payment currency). A mismatch would show prices wrongly, so ordering stops.
 * Databases from before 0010_country.sql have no country: treated as Ghana.
 */
export function countryMismatch(settings: { country?: string | null; currency?: string | null } | null | undefined): string | null {
  const dbCountry = settings?.country ?? "GH";
  if (dbCountry !== COUNTRY.code) {
    return `This installation is set up for ${COUNTRY.name} (NEXT_PUBLIC_COUNTRY=${COUNTRY.code}) but the database is set to ${dbCountry}. Make them match (see docs/SETUP-SUPABASE.md, "Country").`;
  }
  if (settings?.currency && settings.currency.trim() !== COUNTRY.currency.code) {
    return `The database currency is ${settings.currency} but ${COUNTRY.name} uses ${COUNTRY.currency.code}. Make them match (see docs/SETUP-SUPABASE.md, "Country").`;
  }
  return null;
}
