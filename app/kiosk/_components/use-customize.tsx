"use client";

import { useState } from "react";
import type { MenuItem } from "@/lib/db/menu";
import type { CartLine } from "@/lib/kiosk/cart";
import { defaultSelections } from "@/lib/kiosk/cart";
import { useKiosk } from "@/lib/kiosk/kiosk-session";
import { CustomizeSheet } from "./customize-sheet";

/** Opens the customization sheet for a new item or an existing cart line. */
export function useCustomize() {
  const { itemsById, addToCart, updateLine, remove } = useKiosk();
  const [target, setTarget] = useState<{ item: MenuItem; line?: CartLine } | null>(null);

  const openItem = (item: MenuItem) => setTarget({ item });

  /** Items with nothing to choose go straight into the order. */
  const quickAdd = (item: MenuItem) => {
    if (item.customization_groups.length === 0) addToCart(item, defaultSelections(item), 1, "");
    else openItem(item);
  };

  const openLine = (line: CartLine) => {
    const item = itemsById.get(line.menuItemId);
    // Item removed from the menu since it was added: nothing left to customise.
    if (!item) {
      remove(line.lineId);
      return;
    }
    setTarget({ item, line });
  };

  const sheet = target ? (
    <CustomizeSheet
      key={target.line?.lineId ?? target.item.id}
      item={target.item}
      mode={target.line ? "edit" : "add"}
      initial={
        target.line
          ? { selections: target.line.selections, quantity: target.line.quantity, instructions: target.line.instructions }
          : undefined
      }
      onClose={() => setTarget(null)}
      onConfirm={({ selections, quantity, instructions }) => {
        if (target.line) updateLine(target.line.lineId, target.item, selections, quantity, instructions);
        else addToCart(target.item, selections, quantity, instructions);
        setTarget(null);
      }}
    />
  ) : null;

  return { openItem, openLine, quickAdd, sheet };
}
