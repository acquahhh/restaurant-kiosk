"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { formatGhs } from "@/lib/money";
import { createCategory, deleteCategory, moveCategory, toggleItem, updateCategory } from "./actions";
import { btnSecondary, input } from "../ui";

type Category = { id: string; name: string; slug: string; is_active: boolean; sort_order: number };
type Item = { id: string; category_id: string; name: string; base_price: number; image_url: string | null; is_available: boolean; is_featured: boolean; is_popular: boolean };
type Toggle = "is_available" | "is_featured" | "is_popular";

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-palm" : "bg-sand-deep"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function MenuManager({ categories, items }: { categories: Category[]; items: Item[] }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [optimisticItems, setOptimisticItem] = useOptimistic(items, (state, u: { id: string; field: Toggle; value: boolean }) =>
    state.map((i) => (i.id === u.id ? { ...i, [u.field]: u.value } : i)),
  );

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setNotice(r.message || !r.ok ? { ok: r.ok, text: r.message ?? "Something went wrong." } : null);
    });

  const toggle = (id: string, field: Toggle, value: boolean) =>
    start(async () => {
      setOptimisticItem({ id, field, value });
      const r = await toggleItem(id, field, value);
      if (!r.ok) setNotice({ ok: false, text: r.message ?? "Not saved." });
    });

  return (
    <div className="space-y-8">
      {notice ? (
        <p role="status" className={`rounded-lg p-3 font-semibold ${notice.ok ? "bg-palm-soft text-palm" : "bg-pepper-soft text-pepper"}`}>{notice.text}</p>
      ) : null}

      {categories.map((cat, index) => {
        const list = optimisticItems.filter((i) => i.category_id === cat.id);
        const virtualPopular = cat.slug === "popular";
        return (
          <section key={cat.id} className="rounded-xl border border-sand-deep">
            <header className="flex flex-wrap items-center gap-3 border-b border-sand-deep bg-sand/60 px-4 py-3">
              {renaming?.id === cat.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const r = await updateCategory(cat.id, { name: renaming.name });
                      if (r.ok) setRenaming(null);
                      return r;
                    });
                  }}
                >
                  <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: cat.id, name: e.target.value })} className={`${input} max-w-xs`} aria-label="Category name" />
                  <button type="submit" className={btnSecondary} disabled={pending}>Save</button>
                  <button type="button" className={btnSecondary} onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <h2 className="flex-1 text-lg font-bold">
                  {cat.name}
                  {!cat.is_active ? <span className="ml-2 text-sm font-semibold text-ink-muted">(hidden from kiosk)</span> : null}
                </h2>
              )}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button type="button" className="rounded px-2 py-1 font-semibold text-ink-muted hover:bg-sand-deep disabled:opacity-30" disabled={pending || index === 0} onClick={() => run(() => moveCategory(cat.id, -1))} aria-label={`Move ${cat.name} up`}>Up</button>
                <button type="button" className="rounded px-2 py-1 font-semibold text-ink-muted hover:bg-sand-deep disabled:opacity-30" disabled={pending || index === categories.length - 1} onClick={() => run(() => moveCategory(cat.id, 1))} aria-label={`Move ${cat.name} down`}>Down</button>
                <button type="button" className="rounded px-2 py-1 font-semibold text-ink-muted hover:bg-sand-deep" onClick={() => setRenaming({ id: cat.id, name: cat.name })}>Rename</button>
                <button type="button" className="rounded px-2 py-1 font-semibold text-ink-muted hover:bg-sand-deep" disabled={pending} onClick={() => run(() => updateCategory(cat.id, { is_active: !cat.is_active }))}>
                  {cat.is_active ? "Hide" : "Show"}
                </button>
                {list.length === 0 && !virtualPopular ? (
                  <button type="button" className="rounded px-2 py-1 font-semibold text-pepper hover:bg-pepper-soft" disabled={pending} onClick={() => run(() => deleteCategory(cat.id))}>Delete</button>
                ) : null}
              </div>
            </header>

            {virtualPopular ? (
              <p className="px-4 py-3 text-sm text-ink-muted">
                This tab fills itself: it shows every meal switched to Popular below, with Featured meals as Chef’s picks at the top.
              </p>
            ) : list.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">No meals yet. Use Add meal and choose this category.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="text-sm text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Meal</th>
                      <th className="px-4 py-2 text-right font-semibold">Price</th>
                      <th className="px-4 py-2 text-center font-semibold">Available</th>
                      <th className="px-4 py-2 text-center font-semibold">Popular</th>
                      <th className="px-4 py-2 text-center font-semibold">Featured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item) => (
                      <tr key={item.id} className="border-t border-sand-deep">
                        <td className="px-4 py-2.5">
                          <Link href={`/admin/menu/${item.id}`} className="flex items-center gap-3 font-semibold hover:text-palm">
                            {item.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_url} alt="" className="h-10 w-14 rounded-md object-cover" />
                            ) : (
                              <span className="h-10 w-14 rounded-md bg-sand" aria-hidden />
                            )}
                            {item.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatGhs(item.base_price)}</td>
                        <td className="px-4 py-2.5"><div className="flex justify-center"><Switch on={item.is_available} label={`${item.name} available`} onChange={(v) => toggle(item.id, "is_available", v)} /></div></td>
                        <td className="px-4 py-2.5"><div className="flex justify-center"><Switch on={item.is_popular} label={`${item.name} popular`} onChange={(v) => toggle(item.id, "is_popular", v)} /></div></td>
                        <td className="px-4 py-2.5"><div className="flex justify-center"><Switch on={item.is_featured} label={`${item.name} featured`} onChange={(v) => toggle(item.id, "is_featured", v)} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <form
        className="flex flex-wrap gap-2 rounded-xl border border-dashed border-sand-deep p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await createCategory(newCategory);
            if (r.ok) setNewCategory("");
            return r;
          });
        }}
      >
        <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category name, e.g. Breakfast" className={`${input} max-w-sm`} aria-label="New category name" />
        <button type="submit" className={btnSecondary} disabled={pending || !newCategory.trim()}>Add category</button>
      </form>
    </div>
  );
}
