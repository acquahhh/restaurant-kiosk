/**
 * DEVELOPMENT FIXTURE. Mirrors supabase/seed.sql so the kiosk can be built and
 * tested before a Supabase project exists. Phase 3 replaces every import of
 * this file with a database loader; nothing in production reads it.
 */
import type { RestaurantSettingsRow, SelectionType } from "@/lib/db/database.types";
import type { CustomizationGroup, MenuCategory, MenuItem } from "@/lib/db/menu";

const NOW = "2026-11-07T00:00:00.000Z";

export const fixtureSettings: RestaurantSettingsRow = {
  id: 1,
  name: "Harbour Kitchen",
  tagline: "Good Food. Great Moments.",
  logo_url: null,
  currency: "GHS",
  tax_rate_bp: 0,
  service_charge_bp: 0,
  opening_hours: {},
  kiosk_timeout_seconds: 90,
  accept_cash: true,
  accept_mobile_money: true,
  accept_card: true,
  default_prep_minutes: 15,
  kitchen_sound_enabled: true,
  updated_at: NOW,
};

export const fixtureTables = Array.from({ length: 16 }, (_, i) => String(i + 1));

type OptionSpec = [name: string, delta: number, isDefault?: boolean];
type GroupSpec = {
  name: string;
  type: SelectionType;
  required: boolean;
  max: number | null;
  options: OptionSpec[];
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function group(itemId: string, spec: GroupSpec, order: number): CustomizationGroup {
  const id = `${itemId}--${slugify(spec.name)}`;
  return {
    id,
    menu_item_id: itemId,
    name: spec.name,
    selection_type: spec.type,
    is_required: spec.required,
    min_select: spec.required ? 1 : 0,
    max_select: spec.max,
    sort_order: order,
    options: spec.options.map(([name, delta, isDefault], i) => ({
      id: `${id}--${slugify(name)}`,
      group_id: id,
      name,
      price_delta: delta,
      is_default: Boolean(isDefault),
      is_available: true,
      sort_order: i,
    })),
  };
}

type ItemSpec = {
  name: string;
  description: string;
  price: number;
  popular?: boolean;
  featured?: boolean;
  prep: number;
  available?: boolean;
  groups?: GroupSpec[];
};

const meal: GroupSpec = {
  name: "Make it a meal",
  type: "single",
  required: false,
  max: 1,
  options: [["Fries and a soft drink", 2800], ["Plantain and a soft drink", 2600]],
};

const CATALOGUE: Array<{ name: string; slug: string; items: ItemSpec[] }> = [
  { name: "Popular", slug: "popular", items: [] },
  {
    name: "Rice Meals",
    slug: "rice-meals",
    items: [
      {
        name: "Jollof Rice with Grilled Chicken",
        description: "Smoky tomato jollof served with a quarter grilled chicken, shito and fresh salad.",
        price: 7500, popular: true, featured: true, prep: 15,
        groups: [
          { name: "Portion", type: "single", required: true, max: 1, options: [["Regular", 0, true], ["Large", 1500]] },
          { name: "Extras", type: "multiple", required: false, max: 4,
            options: [["Extra chicken", 2500], ["Fried plantain", 1000], ["Boiled egg", 500], ["Extra shito", 300]] },
          { name: "Add a drink", type: "single", required: false, max: 1,
            options: [["Sobolo", 1500], ["Soft drink", 1200], ["Bottled water", 800]] },
        ],
      },
      { name: "Fried Rice with Chicken", description: "Vegetable fried rice with a quarter fried chicken and salad.", price: 7000, popular: true, prep: 15 },
      { name: "Assorted Fried Rice", description: "Fried rice loaded with chicken, beef and sausage.", price: 9500, prep: 18 },
      { name: "Plain Rice with Chicken Stew", description: "Steamed rice with slow-cooked chicken stew.", price: 6000, prep: 12 },
    ],
  },
  {
    name: "Local Dishes",
    slug: "local-dishes",
    items: [
      { name: "Banku with Grilled Tilapia", description: "Two balls of banku, whole grilled tilapia, hot pepper, onion and tomato.", price: 11000, popular: true, featured: true, prep: 25 },
      {
        name: "Waakye Special",
        description: "Rice and beans with shito, gari, spaghetti, boiled egg and your choice of protein.",
        price: 6500, popular: true, prep: 10,
        groups: [{ name: "Protein", type: "single", required: true, max: 1,
          options: [["Fried fish", 0, true], ["Fried chicken", 1000], ["Beef", 1500], ["Wele (cow skin)", 800]] }],
      },
      { name: "Fufu with Light Soup", description: "Pounded fufu with goat light soup.", price: 8500, prep: 20 },
      { name: "Kenkey with Fried Fish", description: "Ga kenkey, fried fish, shito and pepper sauce.", price: 5500, prep: 12 },
      { name: "Red Red", description: "Bean stew in palm oil with fried ripe plantain.", price: 5000, prep: 12, available: false },
    ],
  },
  {
    name: "Chicken",
    slug: "chicken",
    items: [
      { name: "2 Piece Fried Chicken", description: "Two pieces of crispy fried chicken with one side.", price: 6500, popular: true, prep: 12 },
      { name: "4 Piece Fried Chicken", description: "Four pieces of crispy fried chicken with two sides.", price: 12000, prep: 15 },
      { name: "Grilled Chicken Half", description: "Half chicken, marinated and grilled, served with fries or plantain.", price: 9000, featured: true, prep: 20 },
      {
        name: "Chicken Wings (6)",
        description: "Six wings tossed in your choice of sauce.",
        price: 5500, prep: 15,
        groups: [{ name: "Sauce", type: "single", required: true, max: 1,
          options: [["Barbecue", 0, true], ["Hot pepper", 0], ["Honey garlic", 0]] }],
      },
    ],
  },
  {
    name: "Burgers",
    slug: "burgers",
    items: [
      { name: "Classic Beef Burger", description: "Flame-grilled beef patty, cheddar, lettuce, tomato and house sauce.", price: 6500, prep: 12, groups: [meal] },
      { name: "Crispy Chicken Burger", description: "Crispy fried chicken fillet, coleslaw and spicy mayo.", price: 6000, popular: true, prep: 12, groups: [meal] },
      { name: "Double Beef Burger", description: "Two beef patties, double cheese, caramelised onion.", price: 9000, prep: 15, groups: [meal] },
    ],
  },
  {
    name: "Snacks",
    slug: "snacks",
    items: [
      { name: "Meat Pie", description: "Baked pastry filled with seasoned minced beef.", price: 1200, prep: 3 },
      { name: "Spring Rolls (4)", description: "Crispy vegetable spring rolls with sweet chilli.", price: 2500, prep: 6 },
      { name: "Kelewele Cup", description: "Spiced fried plantain cubes with roasted peanuts.", price: 2000, popular: true, prep: 6 },
    ],
  },
  {
    name: "Sides",
    slug: "sides",
    items: [
      { name: "French Fries", description: "Golden fries, lightly salted.", price: 2000, prep: 6 },
      { name: "Fried Plantain", description: "Ripe plantain, fried till caramelised.", price: 1800, prep: 6 },
      { name: "Coleslaw", description: "Fresh cabbage and carrot in creamy dressing.", price: 1200, prep: 2 },
      { name: "Garden Salad", description: "Lettuce, cucumber, tomato and onion.", price: 1500, prep: 3 },
    ],
  },
  {
    name: "Drinks",
    slug: "drinks",
    items: [
      { name: "Sobolo", description: "Chilled hibiscus drink with ginger and pineapple.", price: 1500, popular: true, prep: 1 },
      { name: "Fresh Pineapple Juice", description: "Freshly pressed, served over ice.", price: 2500, prep: 2 },
      {
        name: "Soft Drink", description: "Coca-Cola, Fanta, Sprite or Malta.", price: 1200, prep: 1,
        groups: [{ name: "Flavour", type: "single", required: true, max: 1,
          options: [["Coca-Cola", 0, true], ["Fanta", 0], ["Sprite", 0], ["Malta", 0]] }],
      },
      { name: "Bottled Water", description: "750ml still water.", price: 800, prep: 1 },
    ],
  },
  {
    name: "Desserts",
    slug: "desserts",
    items: [
      { name: "Vanilla Ice Cream", description: "Two scoops with chocolate drizzle.", price: 2000, prep: 2 },
      { name: "Chocolate Cake Slice", description: "Rich chocolate sponge with ganache.", price: 2800, prep: 2 },
    ],
  },
];

export const fixtureMenu: MenuCategory[] = CATALOGUE.map((cat, ci) => {
  const categoryId = `cat-${cat.slug}`;
  return {
    id: categoryId,
    name: cat.name,
    slug: cat.slug,
    image_url: null,
    sort_order: ci,
    is_active: true,
    created_at: NOW,
    updated_at: NOW,
    items: cat.items.map((spec, ii): MenuItem => {
      const id = `item-${slugify(spec.name)}`;
      return {
        id,
        category_id: categoryId,
        name: spec.name,
        description: spec.description,
        image_url: null,
        image_credit: null,
        base_price: spec.price,
        is_available: spec.available ?? true,
        is_featured: Boolean(spec.featured),
        is_popular: Boolean(spec.popular),
        prep_minutes: spec.prep,
        sort_order: ii,
        created_at: NOW,
        updated_at: NOW,
        customization_groups: (spec.groups ?? []).map((g, gi) => group(id, g, gi)),
      };
    }),
  };
});
