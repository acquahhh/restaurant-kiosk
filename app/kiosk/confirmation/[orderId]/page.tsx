import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServerWriteConfigured } from "@/lib/supabase/config";
import { ConfirmationView, type ConfirmedOrder } from "./confirmation-view";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID_RE.test(orderId) || !isServerWriteConfigured()) notFound();

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_type, status, table_number, customer_name, total, payment_status, payment_method, estimated_ready_at, placed_at",
    )
    .eq("id", orderId)
    .single();

  // Only fresh orders: an old confirmation link must not be reopened on the kiosk.
  if (!order || Date.now() - new Date(order.placed_at).getTime() > 30 * 60 * 1000) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, item_name, quantity, line_total, special_instructions, order_item_customizations(option_name)")
    .eq("order_id", orderId);

  const confirmed: ConfirmedOrder = {
    ...order,
    items: (items ?? []).map((i) => ({
      id: i.id,
      name: i.item_name,
      quantity: i.quantity,
      lineTotal: i.line_total,
      instructions: i.special_instructions,
      // Cast until `npm run db:types` generates relationship types from the live project.
      options: ((i.order_item_customizations as unknown as { option_name: string }[] | null) ?? []).map((c) => c.option_name),
    })),
  };

  return <ConfirmationView order={confirmed} />;
}
