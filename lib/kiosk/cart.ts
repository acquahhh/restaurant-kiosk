/**
 * Cart logic: pure functions, no React. The server repeats the same price
 * calculation from the database in Phase 3, so client totals are display only.
 */
import { computeTotals, type OrderTotals, type Pesewas } from "@/lib/money";
import type { CustomizationGroup, MenuItem } from "@/lib/db/menu";

/** groupId → selected optionIds */
export type Selections = Record<string, string[]>;

export interface CartLine {
  /** Unique per line; the same meal with different options is a different line. */
  lineId: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  basePrice: Pesewas;
  selections: Selections;
  /** Snapshot of chosen options for display: "Large", "Extra chicken" */
  optionSummary: Array<{ groupName: string; optionName: string; priceDelta: Pesewas }>;
  unitPrice: Pesewas;
  quantity: number;
  instructions: string;
}

export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_INSTRUCTIONS_LENGTH = 140;

/** Default selections when a customization sheet opens. */
export function defaultSelections(item: MenuItem): Selections {
  const result: Selections = {};
  for (const group of item.customization_groups) {
    const defaults = group.options.filter((o) => o.is_default && o.is_available).map((o) => o.id);
    if (defaults.length > 0) {
      result[group.id] = group.selection_type === "single" ? defaults.slice(0, 1) : defaults;
    } else if (group.is_required && group.selection_type === "single") {
      const first = group.options.find((o) => o.is_available);
      result[group.id] = first ? [first.id] : [];
    } else {
      result[group.id] = [];
    }
  }
  return result;
}

/** Tap an option. Single groups replace; multiple groups toggle within max. */
export function toggleOption(
  group: CustomizationGroup,
  current: Selections,
  optionId: string,
): Selections {
  const selected = current[group.id] ?? [];
  const option = group.options.find((o) => o.id === optionId);
  if (!option || !option.is_available) return current;

  if (group.selection_type === "single") {
    // Optional single groups can be cleared by tapping the selected option again.
    if (selected.includes(optionId) && !group.is_required) {
      return { ...current, [group.id]: [] };
    }
    return { ...current, [group.id]: [optionId] };
  }

  if (selected.includes(optionId)) {
    return { ...current, [group.id]: selected.filter((id) => id !== optionId) };
  }
  if (group.max_select !== null && selected.length >= group.max_select) return current;
  return { ...current, [group.id]: [...selected, optionId] };
}

export interface GroupProblem {
  groupId: string;
  message: string;
}

/** Returns the first unmet requirement per group, in display order. */
export function validateSelections(item: MenuItem, selections: Selections): GroupProblem[] {
  const problems: GroupProblem[] = [];
  for (const group of item.customization_groups) {
    const count = (selections[group.id] ?? []).length;
    const min = Math.max(group.min_select, group.is_required ? 1 : 0);
    if (count < min) {
      problems.push({
        groupId: group.id,
        message: min === 1 ? `Choose a ${group.name.toLowerCase()}` : `Choose at least ${min}`,
      });
    }
  }
  return problems;
}

export function unitPriceFor(item: MenuItem, selections: Selections): Pesewas {
  let price = item.base_price;
  for (const group of item.customization_groups) {
    for (const optionId of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) price += option.price_delta;
    }
  }
  return price;
}

export function summarizeSelections(item: MenuItem, selections: Selections): CartLine["optionSummary"] {
  const summary: CartLine["optionSummary"] = [];
  for (const group of item.customization_groups) {
    for (const optionId of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) summary.push({ groupName: group.name, optionName: option.name, priceDelta: option.price_delta });
    }
  }
  return summary;
}

function sameSelections(a: Selections, b: Selections): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = [...(a[k] ?? [])].sort().join(",");
    const y = [...(b[k] ?? [])].sort().join(",");
    if (x !== y) return false;
  }
  return true;
}

export function clampQuantity(n: number): number {
  return Math.min(MAX_QUANTITY_PER_LINE, Math.max(1, Math.floor(n)));
}

export function buildLine(
  item: MenuItem,
  selections: Selections,
  quantity: number,
  instructions: string,
  lineId: string,
): CartLine {
  return {
    lineId,
    menuItemId: item.id,
    name: item.name,
    imageUrl: item.image_url,
    basePrice: item.base_price,
    selections,
    optionSummary: summarizeSelections(item, selections),
    unitPrice: unitPriceFor(item, selections),
    quantity: clampQuantity(quantity),
    instructions: instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH),
  };
}

/**
 * Add a line. If an identical meal (same options, same instructions) is
 * already in the cart, increase its quantity instead of adding a duplicate row.
 */
export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const match = lines.find(
    (l) =>
      l.menuItemId === line.menuItemId &&
      l.instructions === line.instructions &&
      sameSelections(l.selections, line.selections),
  );
  if (!match) return [...lines, line];
  return lines.map((l) =>
    l.lineId === match.lineId ? { ...l, quantity: clampQuantity(l.quantity + line.quantity) } : l,
  );
}

export function replaceLine(lines: CartLine[], lineId: string, next: CartLine): CartLine[] {
  return lines.map((l) => (l.lineId === lineId ? { ...next, lineId } : l));
}

export function setQuantity(lines: CartLine[], lineId: string, quantity: number): CartLine[] {
  if (quantity < 1) return lines.filter((l) => l.lineId !== lineId);
  return lines.map((l) => (l.lineId === lineId ? { ...l, quantity: clampQuantity(quantity) } : l));
}

export function removeLine(lines: CartLine[], lineId: string): CartLine[] {
  return lines.filter((l) => l.lineId !== lineId);
}

export function lineTotal(line: CartLine): Pesewas {
  return line.unitPrice * line.quantity;
}

export function itemCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

export function cartTotals(lines: CartLine[], taxRateBp: number, serviceChargeBp: number): OrderTotals {
  return computeTotals(lines.map(lineTotal), taxRateBp, serviceChargeBp);
}
