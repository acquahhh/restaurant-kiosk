"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RestaurantSettingsRow } from "@/lib/db/database.types";
import type { MenuCategory, MenuItem } from "@/lib/db/menu";
import {
  addLine, buildLine, cartTotals, itemCount, removeLine, replaceLine, setQuantity,
  type CartLine, type Selections,
} from "./cart";

export type OrderType = "dine_in" | "takeaway";

export interface SessionState {
  orderType: OrderType | null;
  tableNumber: string | null;
  customerName: string;
  customerPhone: string;
  lines: CartLine[];
  /** Generated when checkout opens; reused on retries so the server never creates two orders. */
  idempotencyKey: string | null;
}

const EMPTY: SessionState = {
  orderType: null,
  tableNumber: null,
  customerName: "",
  customerPhone: "",
  lines: [],
  idempotencyKey: null,
};

type Action =
  | { type: "hydrate"; state: SessionState }
  | { type: "setDineIn"; table: string }
  | { type: "setTakeaway"; name: string; phone: string }
  | { type: "add"; line: CartLine }
  | { type: "replace"; lineId: string; line: CartLine }
  | { type: "quantity"; lineId: string; quantity: number }
  | { type: "remove"; lineId: string }
  | { type: "ensureKey" }
  | { type: "reset" };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "setDineIn":
      return { ...state, orderType: "dine_in", tableNumber: action.table, customerName: "", customerPhone: "" };
    case "setTakeaway":
      return { ...state, orderType: "takeaway", tableNumber: null, customerName: action.name, customerPhone: action.phone };
    case "add":
      return { ...state, lines: addLine(state.lines, action.line), idempotencyKey: null };
    case "replace":
      return { ...state, lines: replaceLine(state.lines, action.lineId, action.line), idempotencyKey: null };
    case "quantity":
      return { ...state, lines: setQuantity(state.lines, action.lineId, action.quantity), idempotencyKey: null };
    case "remove":
      return { ...state, lines: removeLine(state.lines, action.lineId), idempotencyKey: null };
    case "ensureKey":
      return state.idempotencyKey ? state : { ...state, idempotencyKey: newId() };
    case "reset":
      return EMPTY;
  }
}

const STORAGE_KEY = "kiosk-session-v1";

interface KioskContextValue {
  settings: RestaurantSettingsRow;
  menu: MenuCategory[];
  tables: string[];
  itemsById: Map<string, MenuItem>;
  state: SessionState;
  hydrated: boolean;
  count: number;
  totals: ReturnType<typeof cartTotals>;
  setDineIn: (table: string) => void;
  setTakeaway: (name: string, phone: string) => void;
  addToCart: (item: MenuItem, selections: Selections, quantity: number, instructions: string) => void;
  updateLine: (lineId: string, item: MenuItem, selections: Selections, quantity: number, instructions: string) => void;
  changeQuantity: (lineId: string, quantity: number) => void;
  remove: (lineId: string) => void;
  ensureIdempotencyKey: () => void;
  reset: () => void;
  /** Set while a payment is in flight; the inactivity reset never fires during it. */
  paymentInProgress: boolean;
  setPaymentInProgress: (v: boolean) => void;
  /** Bumps on every "add" so the order panel can animate the new line. */
  lastAddedAt: number;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({
  settings, menu, tables, children,
}: {
  settings: RestaurantSettingsRow;
  menu: MenuCategory[];
  tables: string[];
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [lastAddedAt, setLastAddedAt] = useState(0);
  const skipFirstPersist = useRef(true);

  // Restore after a reload (e.g. the kiosk browser restarts mid-order).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) dispatch({ type: "hydrate", state: { ...EMPTY, ...JSON.parse(raw) } });
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (skipFirstPersist.current) {
      skipFirstPersist.current = false;
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the in-memory cart still works.
    }
  }, [state]);

  const itemsById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const c of menu) for (const i of c.items) map.set(i.id, i);
    return map;
  }, [menu]);

  const value = useMemo<KioskContextValue>(() => ({
    settings,
    menu,
    tables,
    itemsById,
    state,
    hydrated,
    count: itemCount(state.lines),
    totals: cartTotals(state.lines, settings.tax_rate_bp, settings.service_charge_bp),
    setDineIn: (table) => dispatch({ type: "setDineIn", table }),
    setTakeaway: (name, phone) => dispatch({ type: "setTakeaway", name, phone }),
    addToCart: (item, selections, quantity, instructions) => {
      dispatch({ type: "add", line: buildLine(item, selections, quantity, instructions, newId()) });
      setLastAddedAt(Date.now());
    },
    updateLine: (lineId, item, selections, quantity, instructions) =>
      dispatch({ type: "replace", lineId, line: buildLine(item, selections, quantity, instructions, lineId) }),
    changeQuantity: (lineId, quantity) => dispatch({ type: "quantity", lineId, quantity }),
    remove: (lineId) => dispatch({ type: "remove", lineId }),
    ensureIdempotencyKey: () => dispatch({ type: "ensureKey" }),
    reset: () => {
      dispatch({ type: "reset" });
      setPaymentInProgress(false);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
    paymentInProgress,
    setPaymentInProgress,
    lastAddedAt,
  }), [settings, menu, tables, itemsById, state, hydrated, paymentInProgress, lastAddedAt]);

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk(): KioskContextValue {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used inside <KioskProvider>");
  return ctx;
}

/** Stable callback for components that only need reset. */
export function useKioskReset() {
  const { reset } = useKiosk();
  return useCallback(() => reset(), [reset]);
}
