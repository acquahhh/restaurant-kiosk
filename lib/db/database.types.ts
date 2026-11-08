/**
 * Database types matching supabase/migrations/0001_initial_schema.sql.
 * Written by hand for Phase 1 so the app typechecks before a Supabase project
 * exists. Once the migration is applied, regenerate with `npm run db:types`
 * and this file is overwritten.
 */

export type UserRole = "admin" | "manager" | "kitchen";
export type OrderType = "dine_in" | "takeaway";
export type OrderStatus =
  | "pending_payment"
  | "received"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PaymentMethod = "mobile_money" | "card" | "cash";
export type PaymentProvider = "paystack" | "cash";
export type SelectionType = "single" | "multiple";

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Build Insert/Update variants: generated/defaulted columns become optional. */
type WithDefaults<Row, Defaulted extends keyof Row> = Omit<Row, Defaulted> &
  Partial<Pick<Row, Defaulted>>;

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type RestaurantSettingsRow = {
  id: number;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  currency: string;
  tax_rate_bp: number;
  service_charge_bp: number;
  opening_hours: Json;
  kiosk_timeout_seconds: number;
  accept_cash: boolean;
  accept_mobile_money: boolean;
  accept_card: boolean;
  default_prep_minutes: number;
  kitchen_sound_enabled: boolean;
  brand_primary: string;
  brand_accent: string;
  country: string;
  time_zone: string;
  updated_at: string;
}

export type MenuCategoryRow = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type MenuItemRow = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string | null;
  base_price: number;
  is_available: boolean;
  is_featured: boolean;
  is_popular: boolean;
  prep_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CustomizationGroupRow = {
  id: string;
  menu_item_id: string;
  name: string;
  selection_type: SelectionType;
  is_required: boolean;
  min_select: number;
  max_select: number | null;
  sort_order: number;
}

export type CustomizationOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
}

export type RestaurantTableRow = {
  id: string;
  number: string;
  seats: number | null;
  is_active: boolean;
}

export type OrderCounterRow = {
  order_date: string;
  last_number: number;
}

export type OrderRow = {
  id: string;
  order_date: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  table_id: string | null;
  table_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  idempotency_key: string;
  estimated_ready_at: string | null;
  placed_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export type OrderItemRow = {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  special_instructions: string | null;
}

export type OrderItemCustomizationRow = {
  id: string;
  order_item_id: string;
  option_id: string | null;
  group_name: string;
  option_name: string;
  price_delta: number;
}

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  amount: number;
  currency: string;
  reference: string;
  provider_reference: string | null;
  channel: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  raw_response: Json | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatusHistoryRow = {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  changed_at: string;
}

type Table<Row, Defaulted extends keyof Row> = {
  Row: Row;
  Insert: WithDefaults<Row, Defaulted>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "role" | "is_active" | "created_at" | "updated_at">;
      restaurant_settings: Table<
        RestaurantSettingsRow,
        | "id" | "tagline" | "logo_url" | "currency" | "tax_rate_bp" | "service_charge_bp"
        | "opening_hours" | "kiosk_timeout_seconds" | "accept_cash" | "accept_mobile_money"
        | "accept_card" | "default_prep_minutes" | "kitchen_sound_enabled" | "brand_primary" | "brand_accent" | "country" | "time_zone" | "updated_at"
      >;
      menu_categories: Table<
        MenuCategoryRow,
        "id" | "image_url" | "sort_order" | "is_active" | "created_at" | "updated_at"
      >;
      menu_items: Table<
        MenuItemRow,
        | "id" | "description" | "image_url" | "is_available" | "is_featured" | "is_popular"
        | "prep_minutes" | "sort_order" | "created_at" | "updated_at"
      >;
      customization_groups: Table<
        CustomizationGroupRow,
        "id" | "selection_type" | "is_required" | "min_select" | "max_select" | "sort_order"
      >;
      customization_options: Table<
        CustomizationOptionRow,
        "id" | "price_delta" | "is_default" | "is_available" | "sort_order"
      >;
      restaurant_tables: Table<RestaurantTableRow, "id" | "seats" | "is_active">;
      order_counters: Table<OrderCounterRow, "last_number">;
      orders: Table<
        OrderRow,
        | "id" | "order_date" | "order_number" | "status" | "table_id" | "table_number"
        | "customer_name" | "customer_phone" | "tax_amount" | "service_charge"
        | "payment_status" | "payment_method" | "estimated_ready_at" | "placed_at"
        | "preparing_at" | "ready_at" | "completed_at" | "cancelled_at" | "updated_at"
      >;
      order_items: Table<OrderItemRow, "id" | "menu_item_id" | "special_instructions">;
      order_item_customizations: Table<
        OrderItemCustomizationRow,
        "id" | "option_id" | "price_delta"
      >;
      payments: Table<
        PaymentRow,
        | "id" | "currency" | "provider_reference" | "channel" | "status" | "paid_at"
        | "raw_response" | "created_at" | "updated_at"
      >;
      order_status_history: Table<
        OrderStatusHistoryRow,
        "id" | "from_status" | "changed_by" | "changed_at"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      current_role: { Args: Record<string, never>; Returns: UserRole | null };
      next_order_number: { Args: { p_date: string }; Returns: string };
      place_order: { Args: { p: Json }; Returns: Json };
      set_order_status: { Args: { p_order_id: string; p_status: OrderStatus }; Returns: OrderRow };
      mark_cash_paid: { Args: { p_order_id: string }; Returns: OrderRow };
      kitchen_orders: { Args: Record<string, never>; Returns: Json };
      save_menu_item: { Args: { p: Json }; Returns: string };
      start_payment_attempt: { Args: { p_order_id: string; p_method: PaymentMethod }; Returns: Json };
      confirm_payment: {
        Args: { p_reference: string; p_amount: number; p_currency: string; p_provider_reference: string; p_channel: string; p_raw: Json };
        Returns: Json;
      };
      fail_payment: { Args: { p_reference: string; p_raw: Json }; Returns: undefined };
      expire_unpaid_orders: { Args: { p_minutes?: number }; Returns: number };
      payments_to_reconcile: { Args: { p_minutes?: number }; Returns: { reference: string }[] };
      sales_report: { Args: { p_from: string; p_to: string }; Returns: Json };
      order_board: {
        Args: Record<string, never>;
        Returns: { order_number: string; status: OrderStatus; order_type: OrderType; updated_at: string }[];
      };
    };
    Enums: {
      user_role: UserRole;
      order_type: OrderType;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      payment_method: PaymentMethod;
      payment_provider: PaymentProvider;
      selection_type: SelectionType;
    };
    CompositeTypes: Record<string, never>;
  };
}
