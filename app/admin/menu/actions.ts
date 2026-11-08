"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { explainDbError, requireStaff, type ActionResult } from "@/lib/admin/auth";
import { formatMoney } from "@/lib/money";

const uuid = z.string().uuid();

const optionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  price_delta: z.number().int().min(-1_000_000).max(1_000_000),
  is_default: z.boolean(),
  is_available: z.boolean(),
});
const groupSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  selection_type: z.enum(["single", "multiple"]),
  is_required: z.boolean(),
  max_select: z.number().int().min(1).max(20).nullable(),
  options: z.array(optionSchema).min(1).max(30),
});
const itemSchema = z.object({
  id: z.string().optional(),
  category_id: uuid,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300),
  image_url: z.string().url().max(500).or(z.literal("")),
  base_price: z.number().int().min(0).max(10_000_000),
  is_available: z.boolean(),
  is_featured: z.boolean(),
  is_popular: z.boolean(),
  prep_minutes: z.number().int().min(1).max(240).nullable(),
  groups: z.array(groupSchema).max(10),
});
export type ItemInput = z.infer<typeof itemSchema>;

function refresh() {
  revalidatePath("/admin/menu");
  revalidatePath("/kiosk", "layout");
}

export async function saveItem(raw: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".") ?? "";
    return { ok: false, message: field.includes("name") ? "Every meal, group and option needs a name." : `Check the field "${field}".` };
  }
  const { supabase } = await requireStaff();
  const { data, error } = await supabase.rpc("save_menu_item", { p: parsed.data });
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: "Saved. The kiosk shows the change on its next screen load.", id: data as string };
}

const TOGGLES = ["is_available", "is_featured", "is_popular"] as const;
export async function toggleItem(id: string, field: (typeof TOGGLES)[number], value: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success || !TOGGLES.includes(field)) return { ok: false, message: "Unknown meal." };
  const { supabase } = await requireStaff();
  const patch: Partial<Record<(typeof TOGGLES)[number], boolean>> = { [field]: value };
  const { error } = await supabase.from("menu_items").update(patch).eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true };
}

export async function deleteItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown meal." };
  const { supabase } = await requireStaff();
  // Past orders keep their copy of the name and price, so deleting is safe for history.
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: "Meal deleted." };
}

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function createCategory(name: string): Promise<ActionResult> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return { ok: false, message: "Enter a category name." };
  const { supabase } = await requireStaff();
  const { data: last } = await supabase.from("menu_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("menu_categories").insert({ name: clean, slug: slugify(clean) || `category-${Date.now()}`, sort_order: (last?.sort_order ?? 0) + 1 });
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: `Added ${clean}.` };
}

export async function updateCategory(id: string, patch: { name?: string; is_active?: boolean }): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown category." };
  const update: { name?: string; is_active?: boolean } = {};
  if (patch.name !== undefined) {
    update.name = patch.name.trim().slice(0, 40);
    if (!update.name) return { ok: false, message: "Enter a category name." };
  }
  if (patch.is_active !== undefined) update.is_active = patch.is_active;
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("menu_categories").update(update).eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true };
}

export async function moveCategory(id: string, direction: -1 | 1): Promise<ActionResult> {
  const { supabase } = await requireStaff();
  const { data: cats } = await supabase.from("menu_categories").select("id, sort_order").order("sort_order");
  if (!cats) return { ok: false, message: "Could not load categories." };
  const i = cats.findIndex((c) => c.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= cats.length) return { ok: true };
  // Renumber everything so ties in sort_order can never block a move.
  const order = cats.map((c) => c.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  // Usually only the two swapped rows change; write those, at the same time.
  const changes = order
    .map((cid, index) => ({ cid, index }))
    .filter(({ cid, index }) => cats.find((c) => c.id === cid)!.sort_order !== index);
  const results = await Promise.all(
    changes.map(({ cid, index }) => supabase.from("menu_categories").update({ sort_order: index }).eq("id", cid)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, message: explainDbError(failed.error.message) };
  refresh();
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown category." };
  const { supabase } = await requireStaff();
  const { error } = await supabase.from("menu_categories").delete().eq("id", id);
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: "Category deleted." };
}

export async function updatePrice(id: string, basePrice: number): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown meal." };
  if (!Number.isInteger(basePrice) || basePrice < 0 || basePrice > 10_000_000) return { ok: false, message: "Enter a valid price." };
  const { supabase } = await requireStaff();
  const { data, error } = await supabase.from("menu_items").update({ base_price: basePrice }).eq("id", id).select("name").single();
  if (error) return { ok: false, message: explainDbError(error.message) };
  refresh();
  return { ok: true, message: `${data.name} is now ${formatMoney(basePrice)}.` };
}
