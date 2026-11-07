"use client";

import type { MenuItem } from "@/lib/db/menu";
import { formatGhs } from "@/lib/money";
import { FoodImage } from "./food-image";
import { PlusIcon } from "./ui";

export function MenuCard({
  item, onOpen, onAdd, wide = false,
}: {
  item: MenuItem;
  onOpen: () => void;
  onAdd: () => void;
  wide?: boolean;
}) {
  const soldOut = !item.is_available;
  return (
    <article
      className={`group relative flex overflow-hidden rounded-card border-2 border-sand-deep bg-canvas ${
        wide ? "flex-row" : "flex-col"
      } ${soldOut ? "opacity-55" : ""}`}
    >
      {item.image_url ? (
        <FoodImage
          src={item.image_url}
          alt={item.name}
          sizes={wide ? "300px" : "380px"}
          className={wide ? "w-[300px] shrink-0" : "aspect-[4/3] w-full"}
        />
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        disabled={soldOut}
        className="flex flex-1 flex-col p-6 text-left disabled:cursor-not-allowed"
        aria-label={`${item.name}, ${formatGhs(item.base_price)}${soldOut ? ", sold out" : ""}`}
      >
        <h3 className={`${wide ? "text-3xl" : "text-2xl"} font-bold leading-tight tracking-tight`}>{item.name}</h3>
        <p className="mt-2 line-clamp-3 text-lg leading-snug text-ink-muted">{item.description}</p>
        <span className="mt-auto pt-5 text-2xl font-extrabold tabular-nums tracking-tight">{formatGhs(item.base_price)}</span>
      </button>
      <div className="absolute bottom-5 right-5">
        {soldOut ? (
          <span className="rounded-button bg-sand px-4 py-3 text-lg font-semibold text-ink-muted">Sold out</span>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-touch items-center gap-2 rounded-button bg-palm px-6 text-xl font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-palm-deep"
          >
            <PlusIcon className="h-6 w-6" />
            Add
          </button>
        )}
      </div>
    </article>
  );
}
