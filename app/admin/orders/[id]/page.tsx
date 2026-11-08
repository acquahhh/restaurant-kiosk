import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/auth";
import { formatGhs } from "@/lib/money";
import { Badge, PageHeader, STATUS_LABEL } from "../../ui";
import { OrderActions } from "./order-actions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = (iso: string) => new Date(iso).toLocaleString("en-GH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireStaff();

  const [{ data: order }, { data: items }, { data: history }, { data: payments }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_items").select("id, item_name, unit_price, quantity, line_total, special_instructions").eq("order_id", id),
    supabase.from("order_status_history").select("id, from_status, to_status, changed_at, changed_by").eq("order_id", id).order("changed_at"),
    supabase.from("payments").select("id, method, provider, amount, status, reference, paid_at, created_at").eq("order_id", id).order("created_at"),
  ]);
  if (!order) notFound();

  const itemIds = (items ?? []).map((i) => i.id);
  const staffIds = [...new Set((history ?? []).map((h) => h.changed_by).filter(Boolean))] as string[];
  const [{ data: customizations }, { data: staff }] = await Promise.all([
    itemIds.length
      ? supabase.from("order_item_customizations").select("order_item_id, group_name, option_name, price_delta").in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as { order_item_id: string; group_name: string; option_name: string; price_delta: number }[] }),
    staffIds.length ? supabase.from("profiles").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const staffName = (sid: string | null) => (sid ? staff?.find((s) => s.id === sid)?.full_name ?? "Staff" : "Kiosk");
  const open = !["completed", "cancelled"].includes(order.status);

  return (
    <>
      <Link href="/admin/orders" className="text-sm font-semibold text-palm">Back to orders</Link>
      <PageHeader
        title={`Order ${order.order_number}`}
        description={`${time(order.placed_at)}, ${order.order_type === "dine_in" ? `dine in, table ${order.table_number}` : `takeaway for ${order.customer_name}`}${order.customer_phone ? `, ${order.customer_phone}` : ""}`}
        actions={<OrderActions orderId={order.id} canCancel={open} canMarkPaid={order.payment_method === "cash" && order.payment_status !== "paid" && order.status !== "cancelled"} />}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={STATUS_LABEL[order.status]!.tone}>{STATUS_LABEL[order.status]!.label}</Badge>
        {order.payment_status === "paid" ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Unpaid</Badge>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <section className="rounded-xl border border-sand-deep p-5">
          <h2 className="font-bold">Items</h2>
          <ul className="mt-3 divide-y divide-sand-deep">
            {(items ?? []).map((i) => (
              <li key={i.id} className="flex justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold">{i.quantity} × {i.item_name}</p>
                  {(customizations ?? []).filter((c) => c.order_item_id === i.id).map((c) => (
                    <p key={c.option_name + c.group_name} className="text-sm text-ink-muted">
                      {c.group_name}: {c.option_name}{c.price_delta ? ` (+${formatGhs(c.price_delta)})` : ""}
                    </p>
                  ))}
                  {i.special_instructions ? <p className="text-sm italic text-ink-muted">Note: {i.special_instructions}</p> : null}
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-semibold">{formatGhs(i.line_total)}</p>
                  {i.quantity > 1 ? <p className="text-sm text-ink-muted">{formatGhs(i.unit_price)} each</p> : null}
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-sand-deep pt-3 tabular-nums">
            {order.tax_amount || order.service_charge ? (
              <>
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatGhs(order.subtotal)}</dd></div>
                {order.tax_amount ? <div className="flex justify-between text-ink-muted"><dt>Tax</dt><dd>{formatGhs(order.tax_amount)}</dd></div> : null}
                {order.service_charge ? <div className="flex justify-between text-ink-muted"><dt>Service charge</dt><dd>{formatGhs(order.service_charge)}</dd></div> : null}
              </>
            ) : null}
            <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{formatGhs(order.total)}</dd></div>
          </dl>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-sand-deep p-5">
            <h2 className="font-bold">History</h2>
            <ol className="mt-3 space-y-2">
              {(history ?? []).map((h) => (
                <li key={h.id} className="flex justify-between gap-4 text-sm">
                  <span><span className="font-semibold">{STATUS_LABEL[h.to_status]?.label}</span> by {staffName(h.changed_by)}</span>
                  <span className="tabular-nums text-ink-muted">{time(h.changed_at)}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-xl border border-sand-deep p-5">
            <h2 className="font-bold">Payments</h2>
            {(payments ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">No payment recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {payments!.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4">
                    <span>
                      <span className="font-semibold">{p.method === "cash" ? "Cash" : p.method === "mobile_money" ? "Mobile Money" : "Card"}</span>{" "}
                      <Badge tone={p.status === "paid" ? "green" : p.status === "failed" ? "red" : "grey"}>{p.status}</Badge>
                      <span className="block text-ink-muted">{p.reference}</span>
                    </span>
                    <span className="tabular-nums">{formatGhs(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
