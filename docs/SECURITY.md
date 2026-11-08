# Security review

Reviewed: 8 November 2026. Scope: database rules, server actions and routes,
what reaches the browser, payments, deployment inside the restaurant.

## How the system is protected

| Layer | Protection |
|---|---|
| Network | The app runs on a PC inside the restaurant with no public address (LOCAL-SERVER-SETUP.md). The firewall rule admits the local network only. All traffic between screens and the server is HTTPS (TLS 1.3) with the restaurant's own certificate authority; plain http only redirects. |
| Database | Row level security on every table. The public key can read the menu, settings, active tables and the order-number board, and nothing else. Every change goes through checked database functions. |
| Money | Prices are recalculated in the database from the menu; the kiosk sends only item ids and choices. An order is marked paid only after Paystack confirms it and the database re-checks amount and currency. |
| Staff | Roles: admin, manager, kitchen. Each admin action re-checks the role on the server; the database checks it again. |
| Secrets | The Supabase service key and Paystack secret key exist only on the server PC (`.env.local`). Verified absent from every file sent to browsers. |
| Abuse | Rate limits on order placing, payment checks, payment codes and staff sign-in. |
| Browser | Pages cannot be framed by other sites; strict file types; no referrer leakage. |

Even though the app is not on the internet, **Supabase is**, and its address
and public key are in the kiosk page by design. Anyone who copies them from a
kiosk screen could talk to Supabase directly from anywhere. That is why the
database rules above are the real boundary, and they were tested as such.

## Findings fixed in this review

| # | Finding | Fix | Proof |
|---|---|---|---|
| 1 | The public key could call the order-number counter (could make numbers jump). | Revoked (0008). | Public-key call refused; menu and board still readable. |
| 2 | Managers could directly edit any order column, including total and payment status (unused leftover rule). | Rule removed (0008). Cancel and mark-paid go through checked functions. | Manager's direct edit has no effect. |
| 3 | Kitchen accounts could read full payment records (Paystack responses). | Payments readable by managers/admins only (0008). | Kitchen sees none; manager still sees them. |
| 4 | Photo uploads accepted any file type and size at the storage level. | Images only, 5 MB max (0008). | Applied where Supabase Storage supports it. |
| 5 | No limit on orders, payment checks, payment codes or sign-in attempts. | Per-device rate limits (lib/server/rate-limit.ts). | Unit tests; 11th sign-in attempt refused, even with the right password. |
| 6 | No security headers; framework advertised in responses. | Headers added; `X-Powered-By` removed. | Verified on responses. |
| 7 | Traffic inside the restaurant was plain http (staff passwords readable on the network). | HTTPS with the restaurant's own certificate authority; http redirects. | TLS 1.3 verified; untrusted screens refused; order, payment and sign-in work over HTTPS. |
| 8 | Behind the HTTPS server, a device could fake its address to dodge rate limits. | The server takes the address from the connection, never from request headers. | 11 sign-in attempts with a different fake address each time were still limited. |

Also verified: a stranger who signs up with the public key sees no orders,
payments, staff or items; cannot open the kitchen feed or reports, edit the
menu, mark orders paid, change prices, or make themselves admin. A forged
Paystack webhook is rejected. A tampered underpayment is refused and flagged.

Tests: `supabase/tests/hardening_test.sql`, `security_audit.sql` (inventory),
plus the earlier suites (place_order, kitchen, admin, payments).

## Actions for the owner (do these once)

1. **Run `0008_hardening.sql`** in Supabase (SQL Editor).
2. **Turn off public sign-ups in Supabase:** Authentication → Sign In / Providers →
   turn off *Allow new users to sign up*. Staff accounts are created by an admin
   (Authentication → Users → Add user), which keeps working. Strangers' accounts
   get nothing (tested), but there is no reason to allow them.
3. **Two-step login** on the Supabase, Paystack and GitHub accounts.
4. **Make the GitHub repository private** (Settings → General → Danger Zone →
   Change visibility). It contains no secrets, but there is no need to publish
   how the system works.
5. **Revoke the GitHub access token** used during development once the build is
   finished (GitHub → Settings → Developer settings → Fine-grained tokens → Delete).
6. **Backups:** check Supabase → Database → Backups for what your plan includes.
   On plans without downloadable backups, export the orders and menu regularly.

## Remaining risks (accepted, with mitigations)

- **The restaurant's certificate authority key (`certs/ca.key`)** can issue
  certificates every screen trusts. It stays on the server PC only (not in git,
  never copied). If that PC is ever compromised, create a new authority
  (delete `certs`, run the script) and re-trust the screens.
- **Kitchen accounts can read customer names and phone numbers** on orders (they
  need order access for live updates). Use kitchen accounts only on kitchen screens.
- **Sign-in cookies are readable by page scripts** (how Supabase's library works).
  Mitigation: the app loads no third-party scripts.
- **Rate limits reset when the server restarts**; Supabase also rate-limits sign-in.
- **Physical access:** anyone who can use the server PC's Windows account can read
  `.env.local`. Lock the PC with a password; use it for nothing else.
- **Staff who leave:** delete their account in Supabase → Authentication → Users
  the same day.
