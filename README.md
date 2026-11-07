# Restaurant self-service ordering system

Self-service kiosk, kitchen display and admin dashboard for a restaurant in Ghana.
Next.js 15 · TypeScript · Tailwind v4 · Supabase · Paystack.

See `docs/PHASE-1-ARCHITECTURE.md` for the architecture, data model and design direction.

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in Supabase and Paystack keys
npm run typecheck
npm test
npm run dev                       # http://localhost:3000 → /kiosk
```

## Database

Apply in order through the Supabase SQL editor or CLI:

```bash
supabase db push                                  # runs supabase/migrations/*
psql "$DATABASE_URL" -f supabase/seed.sql         # development menu
npm run db:types                                  # regenerate lib/db/database.types.ts
```

To test the schema on plain PostgreSQL without Supabase:

```bash
createdb kiosk_test
psql -d kiosk_test -f supabase/tests/local_shim.sql
psql -d kiosk_test -f supabase/migrations/0001_initial_schema.sql
psql -d kiosk_test -f supabase/seed.sql
psql -d kiosk_test -f supabase/tests/smoke_test.sql
```
