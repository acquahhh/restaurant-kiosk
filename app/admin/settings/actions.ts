"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { explainDbError, requireStaff, type ActionResult } from "@/lib/admin/auth";
import { DAYS } from "@/lib/kiosk/opening-hours";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(60),
  logo_url: z.string().url().max(500).or(z.literal("")),
  tax_rate_bp: z.number().int().min(0).max(10000),
  service_charge_bp: z.number().int().min(0).max(10000),
  accept_cash: z.boolean(),
  accept_mobile_money: z.boolean(),
  accept_card: z.boolean(),
  kiosk_timeout_seconds: z.number().int().min(15).max(600),
  default_prep_minutes: z.number().int().min(1).max(240),
  kitchen_sound_enabled: z.boolean(),
  opening_hours: z.partialRecord(z.enum(DAYS), z.object({ open: hhmm, close: hhmm }).nullable()),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

function refresh() {
  revalidatePath("/admin", "layout");
  revalidatePath("/kiosk", "layout");
}

export async function saveSettings(raw: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: `Check "${parsed.error.issues[0]?.path.join(".")}".` };
  const { supabase } = await requireStaff(["admin"]);
  const { error } = await supabase.from("restaurant_settings").update({ ...parsed.data, logo_url: parsed.data.logo_url || null, tagline: parsed.data.tagline || null }).eq("id", 1);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: "Settings saved. The kiosk uses them from its next screen load." };
}

export async function addTable(number: string): Promise<ActionResult> {
  const clean = number.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,6}$/.test(clean)) return { ok: false, message: "Use up to 6 letters or numbers, like 12 or A3." };
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("restaurant_tables").insert({ number: clean });
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: `Table ${clean} added.` };
}

export async function setTableActive(id: string, isActive: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Unknown table." };
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("restaurant_tables").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteTable(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Unknown table." };
  const { supabase } = await requireStaff();
  // Past orders keep their table number as text, so history is unaffected.
  const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true };
}
