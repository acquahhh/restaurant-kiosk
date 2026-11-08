# Connecting the database (Supabase)

## 1. Create the project
1. Sign in at https://supabase.com/dashboard and click **New project**.
2. Name it `restaurant-kiosk`, set a strong database password (save it in a password manager), and pick the region nearest Ghana that is offered.
3. Wait until the project finishes setting up.

## 2. Create the tables
In the dashboard open **SQL Editor** → **New query**. Run these three files from this repo, one at a time, in this order. Paste the whole file and click **Run**:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_place_order.sql`
3. `supabase/seed.sql`
4. `supabase/migrations/0003_kitchen.sql`
5. `supabase/migrations/0004_admin.sql`
6. `supabase/migrations/0006_payments.sql`
7. `supabase/migrations/0007_board_order_type.sql`
8. `supabase/migrations/0008_hardening.sql`
9. `supabase/migrations/0009_branding.sql`
10. `supabase/migrations/0010_country.sql`

Later migrations are always run in number order. Each one is safe to run again.

Each should end with "Success. No rows returned". Run each file once only.

## 3. Copy the keys into `.env.local`
Open **Project Settings** → **API Keys** (or **API**). Create `.env.local` in the project folder:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key, or the legacy "anon public" key>
SUPABASE_SERVICE_ROLE_KEY=<secret key, or the legacy "service_role" key>
```

The secret / service_role key bypasses all security rules. It only ever goes in `.env.local` and in the hosting provider's server environment variables. Never commit it, paste it in chat, or put it in code.

## 4. Check
`npm run dev`, open http://localhost:3000. The "Development menu" badge must be gone. Place a "Pay at the counter" order; it appears in **Table Editor** → `orders`.

## 5. Create staff accounts
1. **Authentication** → **Users** → **Add user** → **Create new user**. Enter the email and a password, tick **Auto Confirm User**, click **Create user**.
2. **SQL Editor** → **New query**, give the account its role (`admin`, `manager` or `kitchen`):

```sql
insert into public.profiles (id, full_name, role)
select id, 'Your Name', 'admin' from auth.users where email = 'you@example.com';
```

3. Sign in at http://localhost:3000/login. Staff screens: `/admin` (dashboard: reports, orders, menu, settings), `/kitchen` (kitchen display) and `/board` (public order status screen, no sign-in).

Roles: `admin` can do everything; `manager` runs the menu, orders, tables and reports but cannot change restaurant settings; `kitchen` sees only the kitchen display.

## Testing the schema without Supabase
See `supabase/tests/`: `smoke_test.sql` and `place_order_test.sql` run on plain PostgreSQL after `local_shim.sql`.

## Paystack (Mobile Money and card)
Add to `.env.local` (test keys from Paystack → Settings → API Keys & Webhooks):

```
PAYSTACK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_ORDER_EMAIL=orders@your-restaurant.com
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Paystack needs an email for every charge; kiosk customers do not give one, so receipts go to `PAYSTACK_ORDER_EMAIL`, tagged per order.
In test mode no real phone gets a prompt: use the test Mobile Money numbers and test cards from https://paystack.com/docs/payments/test-payments/.
After deployment, set the webhook URL in Paystack to `https://<your-domain>/api/webhooks/paystack`. Until then the kiosk confirms payments by asking Paystack directly, which is enough for testing.

## Country
Each installation serves one restaurant in one country: Ghana (`GH`), Rwanda
(`RW`) or Kenya (`KE`). Set it in two places, once, before taking orders:

1. `.env.local`: `NEXT_PUBLIC_COUNTRY=RW` (then rebuild: `npm run build`).
2. Supabase SQL Editor (example for Rwanda):
   ```sql
   update public.restaurant_settings set country = 'RW', time_zone = 'Africa/Kigali', currency = 'RWF';
   ```
   Ghana: `'GH', 'Africa/Accra', 'GHS'`. Kenya: `'KE', 'Africa/Nairobi', 'KES'`.

If the two disagree, the kiosk stops taking orders and Admin shows a red notice.
Prices are whole units of the smallest coin: pesewas (Ghana), cents (Kenya),
francs (Rwanda, no cents), so set the country **before** entering menu prices.
Payment methods appear only where a provider is ready: Ghana (Paystack) now;
Rwanda after the Intouch connection; Kenya after M-PESA is added.
