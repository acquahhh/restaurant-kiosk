import Link from "next/link";
import { requireStaff } from "@/lib/admin/auth";
import { formatGhs } from "@/lib/money";
import type { OrderStatus } from "@/lib/db/database.types";
import { Badge, PageHeader, STATUS_LABEL, btnSecondary, input } from "../ui";

const PAGE_SIZE = 50;
const STATUSES: OrderStatus[] = ["received", "preparing", "ready", "completed", "cancelled", "pending_payment"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; from?: string; to?: string; page?: string }>;
}) {
  const { supabase } = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const today = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : today;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;

  let query = supabase
    .from("orders")
    .select("id, order_number, order_date, order_type, status, table_number, customer_name, total, payment_status, payment_method, placed_at", { count: "exact" })
    .gte("order_date", from)
    .lte("order_date", to)
    .order("placed_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (sp.status && STATUSES.includes(sp.status as OrderStatus)) query = query.eq("status", sp.status as OrderStatus);
  if (sp.type === "dine_in" || sp.type === "takeaway") query = query.eq("order_type", sp.type);
  const q = (sp.q ?? "").trim().slice(0, 40);
  if (/^\d{1,4}$/.test(q)) query = query.eq("order_number", q.padStart(3, "0"));
  else if (q) query = query.ilike("customer_name", `%${q.replace(/[%_,()]/g, "")}%`);

  const { data: orders, count, error } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const qs = (patch: Record<string, string>) =>
    "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), ...patch }).toString();

  return (
    <>
      <PageHeader title="Orders" description="Search by order number or customer name." />

      <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]" method="get">
        <input name="q" defaultValue={q} placeholder="Order number or name" className={input} aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className={input} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]!.label}</option>)}
        </select>
        <select name="type" defaultValue={sp.type ?? ""} className={input} aria-label="Order type">
          <option value="">Dine in and takeaway</option>
          <option value="dine_in">Dine in</option>
          <option value="takeaway">Takeaway</option>
        </select>
        <input type="date" name="from" defaultValue={from} className={input} aria-label="From date" />
        <input type="date" name="to" defaultValue={to} className={input} aria-label="To date" />
        <button type="submit" className={btnSecondary}>Filter</button>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-pepper-soft p-4 font-semibold text-pepper">Orders could not be loaded.</p>
      ) : !orders?.length ? (
        <div className="rounded-xl border border-dashed border-sand-deep p-10 text-center">
          <p className="text-lg font-semibold">No orders match</p>
          <p className="mt-1 text-ink-muted">Change the dates or clear the filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sand-deep">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-sand text-sm text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">For</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-sand-deep hover:bg-sand/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} prefetch={false} className="font-bold text-palm underline-offset-2 hover:underline">{o.order_number}</Link>
                    {from !== to ? <span className="ml-2 text-sm text-ink-muted">{o.order_date}</span> : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{new Date(o.placed_at).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}</td>
                  <td className="px-4 py-3">{o.order_type === "dine_in" ? `Table ${o.table_number}` : `Takeaway: ${o.customer_name}`}</td>
                  <td className="px-4 py-3"><Badge tone={STATUS_LABEL[o.status]!.tone}>{STATUS_LABEL[o.status]!.label}</Badge></td>
                  <td className="px-4 py-3">
                    {o.payment_status === "paid" ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Unpaid</Badge>}
                    <span className="ml-2 text-sm text-ink-muted">{o.payment_method === "cash" ? "Cash" : o.payment_method === "mobile_money" ? "MoMo" : o.payment_method === "card" ? "Card" : ""}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatGhs(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pages">
          <span className="text-sm text-ink-muted">{count} orders, page {page} of {pages}</span>
          <div className="flex gap-2">
            {page > 1 ? <Link prefetch={false} className={btnSecondary} href={qs({ page: String(page - 1) })}>Previous</Link> : null}
            {page < pages ? <Link prefetch={false} className={btnSecondary} href={qs({ page: String(page + 1) })}>Next</Link> : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
