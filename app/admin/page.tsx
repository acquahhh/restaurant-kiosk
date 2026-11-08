import Link from "next/link";
import { requireStaff } from "@/lib/admin/auth";
import { formatGhs } from "@/lib/money";
import { PageHeader } from "./ui";

interface Report {
  summary: { orders: number; revenue: number; paid: number; unpaid: number; average: number; cancelled: number };
  by_day: Array<{ date: string; orders: number; revenue: number }>;
  by_type: Array<{ type: "dine_in" | "takeaway"; orders: number; revenue: number }>;
  by_payment: Array<{ method: string; orders: number; revenue: number; paid: number | null }>;
  by_hour: Array<{ hour: number; orders: number }>;
  top_items: Array<{ name: string; quantity: number; revenue: number }>;
}

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
] as const;

// Ghana is on GMT all year, so the restaurant date is the UTC date.
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function rangeFor(key: string): { from: string; to: string } {
  const today = new Date();
  const to = isoDate(today);
  const back = (n: number) => isoDate(new Date(today.getTime() - n * 86_400_000));
  switch (key) {
    case "today": return { from: to, to };
    case "30d": return { from: back(29), to };
    case "month": return { from: `${to.slice(0, 8)}01`, to };
    default: return { from: back(6), to };
  }
}

const METHOD_LABEL: Record<string, string> = { cash: "Cash", mobile_money: "Mobile Money", card: "Card", unknown: "Other" };

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-sand-deep p-5">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      {note ? <p className="mt-1 text-sm text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** Plain SVG bar chart: no chart library, readable on a phone. */
function Bars({ data, format, height = 180 }: { data: Array<{ label: string; value: number; title: string }>; format: (n: number) => string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  const showEvery = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Bar chart">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 1);
          return (
            <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={height / 3 - h} height={Math.max(h, d.value > 0 ? 0.6 : 0)} rx={0.6} className="fill-palm">
              <title>{`${d.title}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-2 flex text-xs text-ink-muted">
        {data.map((d, i) => (
          <span key={i} className="truncate text-center" style={{ width: `${w}%` }}>{i % showEvery === 0 ? d.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { supabase } = await requireStaff();
  const { range = "7d" } = await searchParams;
  const { from, to } = rangeFor(range);
  const { data, error } = await supabase.rpc("sales_report", { p_from: from, p_to: to });
  const report = data as unknown as Report | null;

  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Last 7 days";
  const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GH", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title="Reports"
        description={from === to ? shortDate(from) : `${shortDate(from)} to ${shortDate(to)}`}
        actions={
          <div className="flex flex-wrap gap-1 rounded-lg bg-sand p-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/admin?range=${r.key}`}
                prefetch={false}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${r.key === range ? "bg-canvas shadow-sm" : "text-ink-muted"}`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      {error || !report ? (
        <p role="alert" className="rounded-lg bg-pepper-soft p-4 font-semibold text-pepper">
          Reports could not be loaded. If this is a new installation, run supabase/migrations/0004_admin.sql.
        </p>
      ) : report.summary.orders === 0 ? (
        <div className="rounded-xl border border-dashed border-sand-deep p-10 text-center">
          <p className="text-lg font-semibold">No orders in this period</p>
          <p className="mt-1 text-ink-muted">Sales appear here as soon as the kiosk takes orders. Try a longer range.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Stat label="Sales" value={formatGhs(report.summary.revenue)} note={`${rangeLabel.toLowerCase()}`} />
            <Stat label="Orders" value={String(report.summary.orders)} note={report.summary.cancelled ? `${report.summary.cancelled} cancelled, not counted` : undefined} />
            <Stat label="Average order" value={formatGhs(report.summary.average)} />
            <Stat
              label="Not yet paid"
              value={formatGhs(report.summary.unpaid)}
              note={report.summary.unpaid > 0 ? "Cash orders not marked paid" : "Everything is paid"}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <section className="rounded-xl border border-sand-deep p-5">
              <h2 className="font-bold">{report.by_day.length === 1 ? "Orders by hour" : "Sales by day"}</h2>
              <div className="mt-4">
                {report.by_day.length === 1 ? (
                  <Bars
                    data={Array.from({ length: 24 }, (_, h) => {
                      const n = report.by_hour.find((x) => x.hour === h)?.orders ?? 0;
                      return { label: `${h}`, value: n, title: `${h}:00` };
                    }).slice(6, 24)}
                    format={(n) => `${n} orders`}
                  />
                ) : (
                  <Bars
                    data={report.by_day.map((d) => ({ label: shortDate(d.date), value: d.revenue, title: `${shortDate(d.date)}, ${d.orders} orders` }))}
                    format={formatGhs}
                  />
                )}
              </div>
            </section>

            <section className="rounded-xl border border-sand-deep p-5">
              <h2 className="font-bold">Dine in and takeaway</h2>
              <div className="mt-4 space-y-4">
                {(["dine_in", "takeaway"] as const).map((t) => {
                  const row = report.by_type.find((x) => x.type === t);
                  const share = row ? Math.round((row.orders / report.summary.orders) * 100) : 0;
                  return (
                    <div key={t}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{t === "dine_in" ? "Dine in" : "Takeaway"}</span>
                        <span className="tabular-nums text-ink-muted">{row?.orders ?? 0} orders, {formatGhs(row?.revenue ?? 0)}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-sand">
                        <div className="h-2.5 rounded-full bg-palm" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <h2 className="mt-8 font-bold">Payments</h2>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {report.by_payment.map((p) => (
                    <tr key={p.method} className="border-t border-sand-deep">
                      <td className="py-2 font-semibold">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="py-2 text-right tabular-nums">{p.orders}</td>
                      <td className="py-2 text-right tabular-nums">{formatGhs(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {report.by_day.length > 1 ? (
            <section className="rounded-xl border border-sand-deep p-5">
              <h2 className="font-bold">Busiest hours</h2>
              <p className="text-sm text-ink-muted">Orders placed per hour across the period. Useful for staffing.</p>
              <div className="mt-4">
                <Bars
                  data={Array.from({ length: 18 }, (_, i) => {
                    const h = i + 6;
                    return { label: `${h}`, value: report.by_hour.find((x) => x.hour === h)?.orders ?? 0, title: `${h}:00` };
                  })}
                  format={(n) => `${n} orders`}
                  height={130}
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-sand-deep p-5">
            <h2 className="font-bold">Best sellers</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-2 font-semibold">Meal</th>
                  <th className="pb-2 text-right font-semibold">Sold</th>
                  <th className="pb-2 text-right font-semibold">Sales</th>
                </tr>
              </thead>
              <tbody>
                {report.top_items.map((i) => (
                  <tr key={i.name} className="border-t border-sand-deep">
                    <td className="py-2 font-semibold">{i.name}</td>
                    <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                    <td className="py-2 text-right tabular-nums">{formatGhs(i.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
