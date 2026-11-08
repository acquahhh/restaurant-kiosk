"use client";

import { useState, useTransition } from "react";
import type { PexelsPhoto } from "@/lib/pexels";
import { choosePhoto, findPhotos } from "./actions";
import { btnSecondary, input } from "../../ui";

type Item = { id: string; name: string; description: string; imageUrl: string | null; credit: string | null; category: string };

/** Pexels has few photos tagged with Ghanaian dish names; start from a broader description. */
const STARTER_QUERY: Record<string, string> = {
  "Waakye Special": "rice and beans plate",
  "Banku with Grilled Tilapia": "grilled tilapia fish",
  "Fufu with Light Soup": "fufu soup",
  "Kenkey with Fried Fish": "fried fish african food",
  "Red Red": "black eyed peas stew plantain",
  "Kelewele Cup": "fried plantain",
  "Sobolo": "hibiscus drink",
  "Meat Pie": "meat pie pastry",
  "Soft Drink": "soda bottles",
  "Bottled Water": "bottled water",
};

function Row({ item }: { item: Item }) {
  const [query, setQuery] = useState(STARTER_QUERY[item.name] ?? item.name);
  const [photos, setPhotos] = useState<PexelsPhoto[] | null>(null);
  const [current, setCurrent] = useState(item.imageUrl);
  const [credit, setCredit] = useState(item.credit);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const search = () =>
    start(async () => {
      setMessage(null);
      const r = await findPhotos(query);
      if (r.ok) {
        setPhotos(r.photos);
        if (r.photos.length === 0) setMessage({ ok: false, text: "No photos found. Try a simpler description, like the main ingredient." });
      } else setMessage({ ok: false, text: r.message });
    });

  const pick = (p: PexelsPhoto) =>
    start(async () => {
      setChoosing(p.id);
      const r = await choosePhoto(item.id, p.id);
      setChoosing(null);
      setMessage({ ok: r.ok, text: r.message ?? "" });
      if (r.ok && r.url) {
        setCurrent(r.url);
        setCredit(`${p.photographer} on Pexels`);
        setPhotos(null);
      }
    });

  return (
    <section className="rounded-xl border border-sand-deep p-4">
      <div className="flex flex-wrap items-start gap-4">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid h-20 w-28 shrink-0 place-items-center rounded-lg bg-sand text-xs text-ink-muted">No photo</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">{item.category}</p>
          <h2 className="text-lg font-bold">{item.name}</h2>
          <p className="line-clamp-1 text-sm text-ink-muted">{item.description}</p>
          {credit ? <p className="mt-1 text-xs text-ink-muted">Photo: {credit.replace(/ \(https?:.*\)$/, "")}</p> : null}
        </div>
        <form className="flex w-full gap-2 sm:w-auto" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} sm:w-64`} aria-label={`Search photos for ${item.name}`} />
          <button type="submit" className={btnSecondary} disabled={pending}>{pending && choosing === null ? "Searching" : "Search"}</button>
        </form>
      </div>

      {message ? <p role="status" className={`mt-3 text-sm font-semibold ${message.ok ? "text-palm" : "text-pepper"}`}>{message.text}</p> : null}

      {photos && photos.length > 0 ? (
        <>
          <p className="mt-3 text-sm text-ink-muted">Click the photo that looks most like your {item.name}.</p>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {photos.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => pick(p)}
                  className="group relative block w-full overflow-hidden rounded-lg border-2 border-transparent hover:border-palm focus-visible:border-palm disabled:opacity-60"
                  aria-label={`Use photo by ${p.photographer}${p.alt ? `: ${p.alt}` : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumb} alt={p.alt} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink/60 px-2 py-1 text-left text-xs text-white">
                    {choosing === p.id ? "Saving photo" : p.photographer}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">Photos from <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">Pexels</a>.</p>
        </>
      ) : null}
    </section>
  );
}

export function PhotoFinder({ items }: { items: Item[] }) {
  return <div className="space-y-4">{items.map((i) => <Row key={i.id} item={i} />)}</div>;
}
