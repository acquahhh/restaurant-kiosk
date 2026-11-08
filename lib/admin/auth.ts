import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/db/database.types";

/**
 * Server-side gate for admin pages and actions. The proxy already blocks
 * non-staff; this re-checks (defence in depth) and returns the staff profile.
 * RLS in the database is the final word either way.
 */
export async function requireStaff(roles: UserRole[] = ["admin", "manager"]) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("id, full_name, role, is_active").eq("id", userId).single();
  if (!profile?.is_active || !roles.includes(profile.role)) redirect("/login?error=forbidden");
  return { supabase, profile };
}

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

/** Database errors → words a manager understands. */
export function explainDbError(message: string): string {
  if (message.includes("NOT_ALLOWED") || message.includes("row-level security")) return "Your account is not allowed to make this change.";
  if (message.startsWith("INVALID:name")) return "Enter a name (up to 80 characters).";
  if (message.startsWith("INVALID:price")) return "Enter a valid price.";
  if (message.startsWith("INVALID:category")) return "Choose a category.";
  if (message.startsWith("INVALID:group_empty")) return `The choice group "${message.split(":")[2]}" needs at least one option.`;
  if (message.startsWith("INVALID:group_limits")) return `Check the minimum and maximum for "${message.split(":")[2]}".`;
  if (message.startsWith("INVALID:group_name") || message.startsWith("INVALID:option_name")) return "Every choice group and option needs a name.";
  if (message.includes("BAD_TRANSITION")) return "That order has already moved on. Refresh to see its current status.";
  if (message.includes("duplicate key") && message.includes("slug")) return "A category with that name already exists.";
  if (message.includes("duplicate key") && message.includes("number")) return "That table number already exists.";
  if (message.includes("violates foreign key") && message.includes("menu_items")) return "Move or delete the meals in this category first.";
  return "The change could not be saved. Please try again.";
}
