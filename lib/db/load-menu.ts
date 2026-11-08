import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database, RestaurantSettingsRow } from "./database.types";
import type { MenuCategory } from "./menu";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { fixtureMenu, fixtureSettings, fixtureTables } from "@/lib/kiosk/fixture-menu";

export interface KioskData {
  settings: RestaurantSettingsRow;
  menu: MenuCategory[];
  tables: string[];
  source: "database" | "fixture";
}

/**
 * Everything the kiosk needs, read with the public (anon) key under RLS.
 * Without Supabase keys, development falls back to the fixture menu so the
 * UI can still be worked on. Production refuses to run without a database.
 */
export async function loadKioskData(): Promise<KioskData> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }
    return { settings: fixtureSettings, menu: fixtureMenu, tables: fixtureTables, source: "fixture" };
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const [settings, categories, items, groups, options, tables] = await Promise.all([
    supabase.from("restaurant_settings").select("*").eq("id", 1).single(),
    supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("menu_items").select("*").order("sort_order"),
    supabase.from("customization_groups").select("*").order("sort_order"),
    supabase.from("customization_options").select("*").order("sort_order"),
    supabase.from("restaurant_tables").select("number").eq("is_active", true),
  ]);

  const failed = [settings, categories, items, groups, options, tables].find((r) => r.error);
  if (failed?.error) throw new Error(`Could not load the menu: ${failed.error.message}`);
  if (!settings.data) throw new Error("Restaurant settings row is missing. Run supabase/seed.sql.");

  const optionsByGroup = Map.groupBy(options.data!, (o) => o.group_id);
  const groupsByItem = Map.groupBy(
    groups.data!.map((g) => ({ ...g, options: optionsByGroup.get(g.id) ?? [] })),
    (g) => g.menu_item_id,
  );
  const itemsByCategory = Map.groupBy(
    items.data!.map((i) => ({ ...i, customization_groups: groupsByItem.get(i.id) ?? [] })),
    (i) => i.category_id,
  );

  return {
    settings: settings.data,
    menu: categories.data!.map((c) => ({ ...c, items: itemsByCategory.get(c.id) ?? [] })),
    tables: tables.data!.map((t) => t.number).sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    source: "database",
  };
}

export interface Branding {
  name: string;
  logo_url: string | null;
  brand_primary: string;
  brand_accent: string;
}

/** Name, logo and colours only (status board). Public data, read with the public key. */
export async function loadBranding(): Promise<Branding> {
  if (!isSupabaseConfigured()) {
    return { name: fixtureSettings.name, logo_url: null, brand_primary: fixtureSettings.brand_primary, brand_accent: fixtureSettings.brand_accent };
  }
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await supabase.from("restaurant_settings").select("name, logo_url, brand_primary, brand_accent").eq("id", 1).single();
  return data ?? { name: "Restaurant", logo_url: null, brand_primary: "#16603a", brand_accent: "#f2b134" };
}
