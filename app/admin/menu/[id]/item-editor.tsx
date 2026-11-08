"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatGhs, parseGhs } from "@/lib/money";
import { deleteItem, saveItem, type ItemInput } from "../actions";
import { btnDanger, btnPrimary, btnSecondary, input } from "../../ui";

type Option = { id?: string; key?: string; name: string; price_delta: number; is_default: boolean; is_available: boolean };
type Group = { id?: string; key?: string; name: string; selection_type: "single" | "multiple"; is_required: boolean; max_select: number | null; options: Option[] };
export type EditorItem = Omit<ItemInput, "groups"> & { groups: Group[] };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const cedis = (p: number) => (p / 100).toFixed(2);
let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

/** Cedi text field that keeps what the manager types until it is valid. */
function MoneyInput({ value, onChange, label, allowNegative = false }: { value: number; onChange: (p: number) => void; label: string; allowNegative?: boolean }) {
  const [text, setText] = useState(cedis(value));
  const [bad, setBad] = useState(false);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">GH₵</span>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const negative = allowNegative && t.trim().startsWith("-");
          try {
            const p = parseGhs(t.replace("-", ""));
            setBad(false);
            onChange(negative ? -p : p);
          } catch {
            setBad(true);
            onChange(Number.NaN); // makes Save refuse until the amount is fixed
          }
        }}
        onBlur={() => !bad && setText((allowNegative && value < 0 ? "-" : "") + cedis(Math.abs(value)))}
        className={`${input} pl-12 tabular-nums ${bad ? "border-pepper" : ""}`}
      />
    </div>
  );
}

export function ItemEditor({ initial, categories }: { initial: EditorItem; categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [item, setItem] = useState<EditorItem>(() => ({
    ...initial,
    groups: initial.groups.map((g) => ({ ...g, key: g.id ?? newKey(), options: g.options.map((o) => ({ ...o, key: o.id ?? newKey() })) })),
  }));
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EditorItem>(k: K, v: EditorItem[K]) => setItem((s) => ({ ...s, [k]: v }));
  const setGroup = (gi: number, patch: Partial<Group>) =>
    setItem((s) => ({ ...s, groups: s.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)) }));
  const setOption = (gi: number, oi: number, patch: Partial<Option>) =>
    setGroup(gi, { options: item.groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  async function upload(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setNotice({ ok: false, text: "Use a JPG, PNG or WebP photo." });
    if (file.size > MAX_IMAGE_BYTES) return setNotice({ ok: false, text: "That photo is over 5 MB. Export a smaller copy (about 1600 pixels wide is plenty)." });
    setUploading(true);
    setNotice(null);
    const supabase = createClient();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `items/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { cacheControl: "31536000", contentType: file.type });
    setUploading(false);
    if (error) return setNotice({ ok: false, text: `Upload failed: ${error.message}` });
    set("image_url", supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl);
    setNotice({ ok: true, text: "Photo uploaded. Save the meal to keep it." });
  }

  function save() {
    if (!Number.isFinite(item.base_price)) return setNotice({ ok: false, text: "The price is not a valid amount. Use a number like 75 or 82.50." });
    const badOption = item.groups.flatMap((g) => g.options).find((o) => !Number.isFinite(o.price_delta));
    if (badOption) return setNotice({ ok: false, text: `The extra price for "${badOption.name || "an option"}" is not a valid amount.` });
    // Drop editor-only keys; single-choice groups always allow exactly one pick.
    const payload: ItemInput = {
      ...item,
      groups: item.groups.map(({ key: _k, ...g }) => ({
        ...g,
        max_select: g.selection_type === "single" ? 1 : g.max_select,
        options: g.options.map(({ key: _ok, ...o }) => o),
      })),
    };
    start(async () => {
      const r = await saveItem(payload);
      setNotice({ ok: r.ok, text: r.message ?? "" });
      if (r.ok && !item.id && r.id) router.replace(`/admin/menu/${r.id}`);
      else if (r.ok) router.refresh();
    });
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <div className="space-y-8">
        <section className="space-y-4">
          <label className="block">
            <span className="font-semibold">Name</span>
            <input value={item.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="block">
            <span className="font-semibold">Description</span>
            <span className="ml-2 text-sm text-ink-muted">{item.description.length}/300, shown on the kiosk</span>
            <textarea value={item.description} maxLength={300} rows={3} onChange={(e) => set("description", e.target.value)} className={`${input} mt-1 h-auto py-2`} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="font-semibold">Price</span>
              <div className="mt-1"><MoneyInput label="Price" value={item.base_price} onChange={(p) => set("base_price", p)} /></div>
            </label>
            <label className="block">
              <span className="font-semibold">Category</span>
              <select value={item.category_id} onChange={(e) => set("category_id", e.target.value)} className={`${input} mt-1`}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="font-semibold">Ready in (minutes)</span>
              <input type="number" min={1} max={240} value={item.prep_minutes ?? ""} onChange={(e) => set("prep_minutes", e.target.value ? Number(e.target.value) : null)} className={`${input} mt-1`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-6">
            {([["is_available", "Available to order"], ["is_popular", "Show under Popular"], ["is_featured", "Feature as a Chef’s pick"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={item[k]} onChange={(e) => set(k, e.target.checked)} className="h-5 w-5 accent-[var(--color-palm)]" />
                {label}
              </label>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Choices</h2>
              <p className="text-sm text-ink-muted">Sizes, sides, extras and drinks the customer can pick. Prices add to the meal price.</p>
            </div>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => set("groups", [...item.groups, { key: newKey(), name: "", selection_type: "single", is_required: false, max_select: 1, options: [{ key: newKey(), name: "", price_delta: 0, is_default: false, is_available: true }] }])}
            >
              Add choice group
            </button>
          </div>

          {item.groups.length === 0 ? <p className="mt-4 rounded-lg bg-sand p-4 text-ink-muted">No choices. Customers add this meal as it is.</p> : null}

          <div className="mt-4 space-y-4">
            {item.groups.map((g, gi) => (
              <div key={g.key} className="rounded-xl border border-sand-deep p-4">
                <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_auto]">
                  <input value={g.name} placeholder="Group name, e.g. Size or Extras" onChange={(e) => setGroup(gi, { name: e.target.value })} className={input} aria-label="Group name" />
                  <select
                    value={`${g.selection_type}-${g.is_required ? "req" : "opt"}`}
                    onChange={(e) => {
                      const [t, r] = e.target.value.split("-") as ["single" | "multiple", string];
                      setGroup(gi, { selection_type: t, is_required: r === "req", max_select: t === "single" ? 1 : g.max_select ?? null });
                    }}
                    className={input}
                    aria-label="Selection rule"
                  >
                    <option value="single-req">Pick one (required)</option>
                    <option value="single-opt">Pick one (optional)</option>
                    <option value="multiple-opt">Pick any (optional)</option>
                    <option value="multiple-req">Pick at least one</option>
                  </select>
                  <div className="flex gap-1">
                    <button type="button" className="rounded px-2 text-sm font-semibold text-ink-muted hover:bg-sand disabled:opacity-30" disabled={gi === 0}
                      onClick={() => { const gs = [...item.groups]; [gs[gi - 1], gs[gi]] = [gs[gi]!, gs[gi - 1]!]; set("groups", gs); }}>Up</button>
                    <button type="button" className="rounded px-2 text-sm font-semibold text-pepper hover:bg-pepper-soft"
                      onClick={() => set("groups", item.groups.filter((_, i) => i !== gi))}>Remove</button>
                  </div>
                </div>
                {g.selection_type === "multiple" ? (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    Most a customer can pick
                    <input type="number" min={1} max={20} value={g.max_select ?? ""} placeholder="No limit"
                      onChange={(e) => setGroup(gi, { max_select: e.target.value ? Number(e.target.value) : null })} className={`${input} h-9 w-28`} />
                  </label>
                ) : null}

                <table className="mt-3 w-full text-sm">
                  <thead className="text-ink-muted">
                    <tr><th className="pb-1 text-left font-semibold">Option</th><th className="pb-1 text-left font-semibold">Adds</th><th className="pb-1 font-semibold">Default</th><th className="pb-1 font-semibold">In stock</th><th /></tr>
                  </thead>
                  <tbody>
                    {g.options.map((o, oi) => (
                      <tr key={o.key}>
                        <td className="py-1 pr-2"><input value={o.name} placeholder="e.g. Large" onChange={(e) => setOption(gi, oi, { name: e.target.value })} className={`${input} h-9`} aria-label="Option name" /></td>
                        <td className="w-36 py-1 pr-2"><MoneyInput label="Extra price" allowNegative value={o.price_delta} onChange={(p) => setOption(gi, oi, { price_delta: p })} /></td>
                        <td className="py-1 text-center">
                          <input type={g.selection_type === "single" ? "radio" : "checkbox"} name={`default-${g.key}`} checked={o.is_default} className="h-4 w-4 accent-[var(--color-palm)]" aria-label="Selected by default"
                            onChange={(e) => setGroup(gi, { options: g.options.map((x, i) => ({ ...x, is_default: i === oi ? e.target.checked : g.selection_type === "single" ? false : x.is_default })) })} />
                        </td>
                        <td className="py-1 text-center">
                          <input type="checkbox" checked={o.is_available} className="h-4 w-4 accent-[var(--color-palm)]" aria-label="In stock" onChange={(e) => setOption(gi, oi, { is_available: e.target.checked })} />
                        </td>
                        <td className="py-1 text-right">
                          <button type="button" disabled={g.options.length === 1} className="rounded px-2 py-1 font-semibold text-pepper hover:bg-pepper-soft disabled:opacity-30"
                            onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="mt-2 text-sm font-semibold text-palm"
                  onClick={() => setGroup(gi, { options: [...g.options, { key: newKey(), name: "", price_delta: 0, is_default: false, is_available: true }] })}>
                  Add option
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
        <section className="rounded-xl border border-sand-deep p-4">
          <h2 className="font-bold">Photo</h2>
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt="" className="mt-3 aspect-[4/3] w-full rounded-lg object-cover" />
          ) : (
            <div className="mt-3 grid aspect-[4/3] w-full place-items-center rounded-lg bg-sand p-6 text-center text-sm text-ink-muted">
              No photo. A landscape photo of the real dish, about 1600 × 1200, works best.
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnSecondary} disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "Uploading" : item.image_url ? "Replace photo" : "Upload photo"}
            </button>
            {item.image_url ? <button type="button" className={btnSecondary} onClick={() => set("image_url", "")}>Remove</button> : null}
          </div>
        </section>

        <section className="rounded-xl border border-sand-deep p-4">
          <p className="text-sm text-ink-muted">Kiosk price</p>
          <p className="text-2xl font-bold tabular-nums">{Number.isFinite(item.base_price) ? formatGhs(item.base_price) : "Check the price"}</p>
          {notice ? <p role="status" className={`mt-3 rounded-lg p-3 text-sm font-semibold ${notice.ok ? "bg-palm-soft text-palm" : "bg-pepper-soft text-pepper"}`}>{notice.text}</p> : null}
          <button type="button" className={`${btnPrimary} mt-4 w-full`} disabled={pending || uploading} onClick={save}>{pending ? "Saving" : "Save meal"}</button>
          {item.id ? (
            confirmDelete ? (
              <div className="mt-3 rounded-lg bg-pepper-soft p-3 text-sm">
                <p className="font-semibold text-pepper">Delete {item.name}? Past orders keep their record. To hide it for a while, untick Available instead.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className={btnSecondary} onClick={() => setConfirmDelete(false)}>Keep</button>
                  <button type="button" className={`${btnDanger} bg-pepper text-white`} disabled={pending}
                    onClick={() => start(async () => { const r = await deleteItem(item.id!); if (r.ok) router.replace("/admin/menu"); else setNotice({ ok: false, text: r.message ?? "" }); })}>
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={`${btnDanger} mt-3 w-full`} onClick={() => setConfirmDelete(true)}>Delete meal</button>
            )
          ) : null}
        </section>
      </aside>
    </div>
  );
}
