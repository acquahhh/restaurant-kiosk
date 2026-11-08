/** Small shared building blocks for admin pages (server or client). */
export const input =
  "h-11 w-full rounded-lg border border-sand-deep bg-canvas px-3 outline-none focus:border-palm focus:ring-2 focus:ring-palm/20 disabled:bg-sand";
export const btnPrimary =
  "inline-flex h-11 items-center justify-center rounded-lg bg-palm px-5 font-semibold text-white hover:bg-palm-deep disabled:bg-sand-deep disabled:text-ink-muted";
export const btnSecondary =
  "inline-flex h-11 items-center justify-center rounded-lg border border-sand-deep bg-canvas px-4 font-semibold hover:bg-sand disabled:text-ink-muted";
export const btnDanger =
  "inline-flex h-11 items-center justify-center rounded-lg border border-pepper/30 px-4 font-semibold text-pepper hover:bg-pepper-soft disabled:opacity-50";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-ink-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "blue" | "red" | "grey"; children: React.ReactNode }) {
  const tones = {
    green: "bg-palm-soft text-palm",
    amber: "bg-[#fbefd2] text-[#8a5a00]",
    blue: "bg-[#e3ecfd] text-[#1f4fb3]",
    red: "bg-pepper-soft text-pepper",
    grey: "bg-sand text-ink-muted",
  };
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-sm font-semibold ${tones[tone]}`}>{children}</span>;
}

export const STATUS_LABEL: Record<string, { label: string; tone: "green" | "amber" | "blue" | "red" | "grey" }> = {
  pending_payment: { label: "Awaiting payment", tone: "grey" },
  received: { label: "New", tone: "amber" },
  preparing: { label: "Preparing", tone: "blue" },
  ready: { label: "Ready", tone: "green" },
  completed: { label: "Completed", tone: "grey" },
  cancelled: { label: "Cancelled", tone: "red" },
};
