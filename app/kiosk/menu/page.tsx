"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { POPULAR_CATEGORY_SLUG, type MenuItem } from "@/lib/db/menu";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { KioskHeader } from "../_components/kiosk-header";
import { LetterKeyboard } from "../_components/keyboard";
import { MenuCard } from "../_components/menu-card";
import { OrderPanel } from "../_components/order-panel";
import { useCustomize } from "../_components/use-customize";
import { CloseIcon, SearchIcon } from "../_components/ui";

function normalise(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function MenuScreen() {
  const router = useRouter();
  const { menu, state, hydrated } = useKiosk();
  const { openItem, openLine, quickAdd, sheet } = useCustomize();
  const [activeSlug, setActiveSlug] = useState(POPULAR_CATEGORY_SLUG);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // No order type yet (e.g. kiosk reloaded on this page): ask first.
  useEffect(() => {
    if (hydrated && !state.orderType) router.replace("/kiosk/order-type");
  }, [hydrated, state.orderType, router]);

  useEffect(() => {
    router.prefetch("/kiosk/cart");
  }, [router]);

  const allItems = useMemo(() => menu.flatMap((c) => c.items), [menu]);
  const categories = useMemo(
    () => menu.filter((c) => c.is_active && (c.slug === POPULAR_CATEGORY_SLUG || c.items.length > 0)),
    [menu],
  );

  const featured = allItems.filter((i) => i.is_featured && i.is_available).slice(0, 2);
  const featuredIds = new Set(featured.map((i) => i.id));
  // Chef's picks sit above this grid, so they are not repeated in it.
  const popular = allItems.filter((i) => i.is_popular && !featuredIds.has(i.id));
  const active = categories.find((c) => c.slug === activeSlug);
  const items: MenuItem[] = activeSlug === POPULAR_CATEGORY_SLUG ? popular : (active?.items ?? []);

  const results = useMemo(() => {
    const q = normalise(query.trim());
    if (!q) return [];
    return allItems.filter((i) => normalise(`${i.name} ${i.description}`).includes(q));
  }, [query, allItems]);

  function selectCategory(slug: string) {
    setActiveSlug(slug);
    setSearching(false);
    setTyping(false);
    setQuery("");
    gridRef.current?.scrollTo({ top: 0 });
  }

  // Sold-out items stay visible (customers look for them) but sink to the end.
  const sorted = (list: MenuItem[]) => [...list].sort((a, b) => Number(b.is_available) - Number(a.is_available));

  return (
    <>
      <KioskHeader
        backHref="/kiosk/order-type"
        right={
          <button
            type="button"
            onClick={() => {
              setSearching(true);
              setTyping(true);
            }}
            className={`flex h-touch w-[26.25rem] items-center gap-4 rounded-button border-[0.1875rem] px-5 text-left text-xl ${
              searching ? "border-palm" : "border-sand-deep text-ink-muted"
            }`}
          >
            <SearchIcon className="h-7 w-7 shrink-0" />
            <span className="truncate">{query || "Search the menu"}</span>
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 portrait:flex-col">
        <nav className="w-[15rem] shrink-0 overflow-y-auto border-r border-sand-deep py-4 portrait:w-full portrait:overflow-x-auto portrait:overflow-y-hidden portrait:border-b portrait:border-r-0 portrait:py-3" aria-label="Menu categories">
          <ul className="space-y-1 px-3 portrait:flex portrait:gap-2 portrait:space-y-0">
            {categories.map((c) => {
              const selected = !searching && c.slug === activeSlug;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => selectCategory(c.slug)}
                    className={`flex min-h-touch-lg w-full items-center rounded-button px-5 text-left text-xl font-semibold whitespace-nowrap transition-colors duration-100 portrait:min-h-touch portrait:w-auto ${
                      selected ? "bg-palm text-white" : "active:bg-sand"
                    }`}
                  >
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={gridRef} className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-6">
            {searching ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold tracking-tight">
                    {query ? `Results for “${query}”` : "Search the menu"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setSearching(false);
                      setTyping(false);
                      setQuery("");
                    }}
                    className="flex h-touch items-center gap-2 rounded-button px-4 text-xl font-semibold active:bg-sand"
                  >
                    <CloseIcon className="h-6 w-6" />
                    Close search
                  </button>
                </div>
                {query && results.length === 0 ? (
                  <p className="mt-6 text-xl text-ink-muted">
                    Nothing on the menu matches “{query}”. Try a shorter word, like “rice” or “chicken”.
                  </p>
                ) : null}
                <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-5">
                  {sorted(results).map((item) => (
                    <MenuCard key={item.id} item={item} onOpen={() => openItem(item)} onAdd={() => quickAdd(item)} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {activeSlug === POPULAR_CATEGORY_SLUG && featured.length > 0 ? (
                  <section aria-labelledby="featured-heading" className="mb-10">
                    <h2 id="featured-heading" className="text-3xl font-bold tracking-tight">Chef’s picks</h2>
                    <div className="mt-5 grid grid-cols-2 gap-5 portrait:grid-cols-1">
                      {featured.map((item) => (
                        <MenuCard key={item.id} wide item={item} onOpen={() => openItem(item)} onAdd={() => quickAdd(item)} />
                      ))}
                    </div>
                  </section>
                ) : null}

                <h2 className="text-3xl font-bold tracking-tight">
                  {activeSlug === POPULAR_CATEGORY_SLUG ? "Most ordered" : active?.name}
                </h2>
                {items.length === 0 ? (
                  <p className="mt-6 text-xl text-ink-muted">There is nothing in this section right now.</p>
                ) : (
                  <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-5">
                    {sorted(items).map((item) => (
                      <MenuCard key={item.id} item={item} onOpen={() => openItem(item)} onAdd={() => quickAdd(item)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {searching && typing ? (
            <div className="shrink-0 border-t border-sand-deep px-6 py-4">
              <LetterKeyboard
                onKey={(k) => setQuery((q) => (q.length < 30 ? q + k.toLowerCase() : q))}
                onSpace={() => setQuery((q) => (q && !q.endsWith(" ") ? q + " " : q))}
                onBackspace={() => setQuery((q) => q.slice(0, -1))}
                onDone={() => {
                  setTyping(false);
                  if (!query) setSearching(false);
                }}
                doneLabel={query ? "Done" : "Close"}
              />
            </div>
          ) : null}
        </main>

        <OrderPanel onEdit={openLine} />
      </div>

      {sheet}
    </>
  );
}
