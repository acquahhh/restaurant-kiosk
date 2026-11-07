# Phase 1 — Architecture, data model and design direction

Status: complete and verified (typecheck, unit tests, `next build`, migration + seed + smoke test on PostgreSQL 16).

## 1. Stack and why

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js 15 (App Router), React 19, TypeScript strict | One codebase serves three surfaces (kiosk, kitchen, admin). Server actions and route handlers give us a trusted server side for order placement and Paystack verification without a separate API service. |
| Styling | Tailwind CSS v4 with a token layer in `app/globals.css` | Tokens are the design system; components only consume them. |
| Database | Supabase (PostgreSQL 15+) with RLS | Postgres constraints enforce money and state rules at the data layer, not just in UI code. |
| Realtime | Supabase Realtime (`postgres_changes` on `orders`, `order_items`) | Kitchen and tracking screens update without polling. |
| Auth | Supabase Auth, roles in `profiles.role` | Customers never sign in. Staff sign in once per device. |
| Storage | Supabase Storage bucket `menu-images` (public read) | Food photos and logo, uploaded from the admin dashboard. |
| Payments | Paystack (Ghana): Mobile Money (MTN, Telecel, AT), card | Server-side initialize + verify + signed webhook. No client-side "success" is ever trusted. |
| Hosting | Vercel (app) + Supabase cloud | Matches current deployment practice; kiosk runs Chrome in `--kiosk` mode on a Windows or Android touchscreen pointed at `/kiosk`. |

## 2. Repository layout

```
app/
  layout.tsx            root: font, viewport (zoom locked)
  globals.css           design tokens + base styles
  page.tsx              redirects to /kiosk
  kiosk/                Phase 2  customer screens (welcome → order type → menu → customize → cart → checkout → confirmation)
  track/                Phase 4  order progress by order number
  kitchen/              Phase 4  Kitchen Display System
  admin/                Phase 5  dashboard
  login/                Phase 3  staff sign-in
  api/                  Phase 6  payments/verify, webhooks/paystack
lib/
  money.ts              pesewas arithmetic + GH₵ formatting (tested)
  db/database.types.ts  typed schema (hand-written now; `npm run db:types` later)
  db/menu.ts            joined menu shapes used by kiosk and admin
  supabase/client.ts    browser (anon) client
  supabase/server.ts    server client bound to staff session (RLS applies)
  supabase/admin.ts     service-role client, server-only, for order writes and webhooks
middleware.ts           protects /kitchen and /admin by role
supabase/
  migrations/0001_initial_schema.sql
  seed.sql              development menu (working name "Harbour Kitchen", prices editable)
  tests/                local shim + smoke test
```

## 3. Surfaces and roles

| Route | Who | Device |
|---|---|---|
| `/kiosk` | Customers (no account) | 1920×1080 landscape touchscreen |
| `/track/[number]` | Customers | Kiosk side panel or a second display |
| `/kitchen` | kitchen, manager, admin | Tablet or wall screen in the kitchen, dark theme |
| `/admin` | manager, admin (settings and staff are admin-only) | Laptop or phone, responsive |

Middleware checks the session cookie and `profiles.role` before any staff page renders. RLS repeats the same rules at the database, so a bug in the UI cannot leak or alter orders.

## 4. Data model

Money is always an integer in pesewas. Tax and service charge are stored in basis points (1250 = 12.5%). Orders snapshot `item_name`, `unit_price`, `group_name`, `option_name`, `price_delta` and `table_number`, so menu edits and table changes never rewrite history (verified in the smoke test).

```
restaurant_settings (1 row)      profiles ──► auth.users
menu_categories ─┬─► menu_items ─┬─► customization_groups ─► customization_options
                 │               │
restaurant_tables│               │
                 ▼               ▼
orders ─┬─► order_items ─► order_item_customizations
        ├─► payments            (partial unique index: one 'paid' per order)
        └─► order_status_history (written by trigger)
order_counters                   (daily 001, 002, … via next_order_number())
```

Database-enforced rules:

- `idempotency_key` unique → a kiosk retry cannot create a second order.
- `total = subtotal + tax_amount + service_charge`, `line_total = unit_price × quantity`.
- Dine-in requires `table_number`; takeaway requires `customer_name`.
- At most one `paid` payment per order.
- Every status change appends to `order_status_history` and stamps `preparing_at` / `ready_at` / `completed_at` / `cancelled_at`.
- Order numbers restart at 001 each day (Africa/Accra).

## 5. Order lifecycle

```
pending_payment ──(payment verified, or cash accepted)──► received ──► preparing ──► ready ──► completed
       │                                                       │
       └────────────────── cancelled ◄─────────────────────────┘
```

The kitchen only sees `received`, `preparing`, `ready`. A `pending_payment` order that never pays is cancelled by a scheduled job after the kiosk timeout (Phase 6).

## 6. Payment flow (Phase 6 design, fixed now so the schema fits)

1. Kiosk calls server action `placeOrder(cart, idempotencyKey)`. The server recomputes every price from the database, inserts `orders` + items as `pending_payment`, and returns the order id. Client-side prices are display only.
2. Mobile Money: server calls Paystack `POST /charge` with amount (pesewas), `currency: "GHS"`, `mobile_money: { phone, provider }` (`mtn`, `vod`, `atl`), `reference = payments.reference`. The customer approves the prompt on their phone. The kiosk polls our `/api/payments/status/[reference]` while the server verifies with `GET /transaction/verify/:reference`.
3. Card: Paystack hosted checkout opened via QR code on the kiosk, paid on the customer's own phone. Typing card numbers into a shared touchscreen is a poor and risky experience, so this is the recommended approach; confirm or replace with a POS terminal later.
4. `POST /api/webhooks/paystack` verifies `x-paystack-signature` (HMAC-SHA512 of the raw body with the secret key), then verifies the transaction again server-side. Only when `status = success`, `amount` equals `orders.total` and `currency = GHS` does it set `payments.status = paid` and move the order to `received`. Both the poll path and the webhook are idempotent against the same row.
5. Cash (if enabled in settings): order goes straight to `received` with `payment_status = pending`; kitchen and admin show it clearly as unpaid until a staff member marks it paid.

## 7. Resilience for a busy restaurant

- Cart lives in React state mirrored to `sessionStorage`; navigation between kiosk screens never loses it.
- Inactivity timer resets the kiosk after `kiosk_timeout_seconds`, paused while a payment is in progress.
- Menu is fetched once and revalidated on a Realtime change to `menu_items`; a connection drop shows a banner and keeps the last good menu.
- Order submission is idempotent (key generated when checkout opens).
- Kitchen reconnects Realtime automatically and refetches open orders on reconnect, so nothing placed during a blip is missed.

## 8. Design direction

Food is the hero; the interface is the plate. One typeface, a quiet warm palette, and one gold button per screen.

Tokens (in `app/globals.css`):

| Token | Value | Use |
|---|---|---|
| ink | `#1C1B18` | text |
| canvas / sand | `#FFFFFF` / `#F4EFE4` | page / rails and panels |
| palm | `#16603A` | primary actions, selected states |
| plantain | `#F2B134` | the single most important button on a screen (Start order, Pay) |
| pepper | `#B3261E` | remove, errors |
| slate | `#14181D` | kitchen display background |

Type: Bricolage Grotesque, variable weight 400–800. Kiosk body 20px, titles 28px, headings 40px, display 72px, prices 30px at weight 800 with tabular numerals.

Kiosk layout (16:9):

```
┌──────────┬──────────────────────────────────────┬───────────────┐
│ Category │  Search                               │  Your order   │
│ rail     │  ┌────────┐ ┌────────┐ ┌────────┐     │  item  qty  ₵ │
│ (icons + │  │ photo  │ │ photo  │ │ photo  │     │  item  qty  ₵ │
│  labels, │  │ name   │ │ name   │ │ name   │     │               │
│  88px    │  │ ₵ 75.00│ │ ₵ 65.00│ │ ₵ 110  │     │  Subtotal     │
│  tall)   │  │  [Add] │ │  [Add] │ │  [Add] │     │  Total        │
│          │  └────────┘ └────────┘ └────────┘     │ [Checkout]    │
└──────────┴──────────────────────────────────────┴───────────────┘
```

Left-aligned text throughout; prices right-aligned in the order panel. Touch targets: 64px minimum, 88px for primary buttons. Motion only in response to an action (an item sliding into the order panel, a status card changing lane). No decorative icons, no gradients, no emojis.

Rejected on purpose: cream + terracotta + serif (reads as generated), red as a primary (reads as the brand we must not copy), identical shadowed cards everywhere (SaaS template look).

## 9. Content dependencies

The system is complete without these, but the kiosk cannot look commercial until they exist:

- Restaurant name, logo (SVG or PNG ≥ 1024px), and real menu prices.
- Food photography: one landscape photo per item, ≥ 1600×1200, consistent lighting. Photos of the restaurant's own dishes are strongly preferred; licensed stock (Pexels/Unsplash) can bridge the gap. Uploaded through the admin dashboard into `menu-images`.
- Paystack business account (test keys for development, live keys after the business is verified).
- Supabase project.

## 10. Next: Phase 2 — kiosk ordering flow

Build the seven customer screens against the seeded menu using the token system, with cart state, customization pricing, inactivity reset and empty/error states. Payment buttons will submit through the server action but stop at a clearly labelled "payment integration pending" state until Phase 6, never at a fake success.
