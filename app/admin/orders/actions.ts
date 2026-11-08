"use server";

import { revalidatePath } from "next/cache";
import { explainDbError, requireStaff, type ActionResult } from "@/lib/admin/auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  if (!UUID_RE.test(orderId)) return { ok: false, message: "Unknown order." };
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc("set_order_status", { p_order_id: orderId, p_status: "cancelled" });
  if (error) return { ok: false, message: explainDbError(error.message) };
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: "Order cancelled." };
}

export async function markPaid(orderId: string): Promise<ActionResult> {
  if (!UUID_RE.test(orderId)) return { ok: false, message: "Unknown order." };
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc("mark_cash_paid", { p_order_id: orderId });
  if (error) return { ok: false, message: explainDbError(error.message) };
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: "Payment recorded." };
}
