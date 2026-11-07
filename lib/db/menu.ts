import type {
  CustomizationGroupRow,
  CustomizationOptionRow,
  MenuCategoryRow,
  MenuItemRow,
} from "./database.types";

/** Shapes the kiosk and admin work with after joining the menu tables. */
export interface CustomizationGroup extends CustomizationGroupRow {
  options: CustomizationOptionRow[];
}

export interface MenuItem extends MenuItemRow {
  customization_groups: CustomizationGroup[];
}

export interface MenuCategory extends MenuCategoryRow {
  items: MenuItem[];
}

/** Slug of the virtual category driven by menu_items.is_popular. */
export const POPULAR_CATEGORY_SLUG = "popular";
