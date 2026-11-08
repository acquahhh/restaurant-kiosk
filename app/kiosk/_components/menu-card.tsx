"use client";

import { useEffect, useState } from "react";
import type { MenuItem } from "@/lib/db/menu";
import { formatMoney } from "@/lib/money";
import { FoodImage } from "./food-image";
import { CheckIcon, PlusIcon } from "./ui";

export function MenuCard({
  item, onOpen, onAdd, wide = false, index = 0,
}: {
  item: MenuItem;
  onOpen: () => void;
  onAdd: () => void;
  wide?: boolean;
  /** Position in the grid: cards rise in one after another. */
  index?: number;
}) {
  const soldOut = !item.is_available;
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(false), 1400);
    return () => window.clearTimeout(id);
  }, [added]);
  const badge = item.is_featured ? "Chef’s pick" : item.is_popular ? "Popular" : null;

  return (
    <article
      className={`group relative flex overflow-hidden rounded-card border-2 bg-canvas transition-[border-color,box-shadow,transform] duration-200 animate-[rise_480ms_cubic-bezier(0.22,1,0.36,1)_both] active:scale-[0.985] ${
        added ? "border-palm shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.08)]" : "border-sand-deep"
      } ${wide ? "flex-row" : "flex-col"} ${soldOut ? "opacity-55" : ""}`}
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      {item.image_url ? (
        <FoodImage
          src={item.image_url}
          alt={item.name}
          sizes={wide ? "300px" : "380px"}
          className={wide ? "w-[18.75rem] shrink-0" : "aspect-[4/3] w-full"}
        />
      ) : null}
      {badge && !soldOut ? (
        <span className={`absolute left-4 top-4 z-10 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ${
          item.is_featured ? "bg-plantain text-ink" : "bg-palm text-white"
        } ${item.image_url ? "shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.2)]" : ""}`}>
          {badge}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={onOpen}
          disabled={soldOut}
          className={`flex flex-1 flex-col px-6 pt-6 text-left disabled:cursor-not-allowed ${badge && !item.image_url ? "pt-14" : ""}`}
          aria-label={`${item.name}, ${formatMoney(item.base_price)}${soldOut ? ", sold out" : ""}`}
        >
          <h3 className={`${wide ? "text-3xl" : "text-2xl"} font-bold leading-tight tracking-tight`}>{item.name}</h3>
          <p className="mt-2 line-clamp-3 text-lg leading-snug text-ink-muted">{item.description}</p>
        </button>
        {/* Price and Add share one row in normal flow: they can never overlap, and the price never wraps. */}
        <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-4">
          <span className="whitespace-nowrap text-[1.375rem] font-extrabold tabular-nums tracking-tight">{formatMoney(item.base_price)}</span>
          {soldOut ? (
            <span className="whitespace-nowrap rounded-button bg-sand px-4 py-3 text-lg font-semibold text-ink-muted">Sold out</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onAdd();
                if (item.customization_groups.length === 0) setAdded(true);
              }}
              className={`flex h-touch shrink-0 items-center gap-2 whitespace-nowrap rounded-button px-5 text-xl font-semibold text-white transition-[background-color,transform] duration-150 active:scale-95 ${
                added ? "bg-palm-deep" : "bg-palm active:bg-palm-deep"
              }`}
              aria-live="polite"
            >
              {added ? <CheckIcon className="h-6 w-6 animate-[pop-in_300ms_ease-out]" /> : <PlusIcon className="h-6 w-6" />}
              {added ? "Added" : "Add"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
