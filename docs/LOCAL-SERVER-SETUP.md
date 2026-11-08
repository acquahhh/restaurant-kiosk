# Running the system inside the restaurant only

The app runs on **one computer in the restaurant** (the "server PC"). The
kiosk, kitchen, status board and admin screens open it over the restaurant's
own network. It has **no public web address**: nobody on the internet can
reach or find it.

The restaurant still needs an internet connection: the menu and orders are
stored in Supabase (online) and Paystack takes payments online. The server PC
connects *out* to them; nothing on the internet can connect *in*.

Paystack's webhook cannot reach a server without a public address. Instead,
the server re-checks every recent unpaid Paystack payment with Paystack every
30 seconds, so a customer who pays and walks away before the kiosk confirms is
still served.

## The server PC
Any Windows 10/11 PC that stays on during opening hours: the kiosk PC itself,
or a small separate PC. 8 GB memory or more.

1. Install **Node.js LTS** (nodejs.org), **Git** (git-scm.com) and **Google Chrome**.
2. Clone the app (or copy the folder) to `C:\restaurant-kiosk`:
   ```powershell
   cd C:\
   git clone https://github.com/acquahhh/restaurant-kiosk.git
   cd restaurant-kiosk
   npm ci
   ```
3. Create `.env.local` with the Supabase and Paystack keys (see SETUP-SUPABASE.md).
   Use **live** Paystack keys only on this PC, never in code or chat.
4. Build once: `npm run build`.
5. Give the PC a fixed address on the network: in the router's admin page,
   reserve an IP for it (DHCP reservation), e.g. `192.168.1.50`. Find the
   current one with `ipconfig` (IPv4 Address of the Wi-Fi or Ethernet adapter).
6. Allow the other screens to reach it, from the local network only
   (PowerShell **as Administrator**). 443 is HTTPS; 80 and 3000 only redirect to it:
   ```powershell
   New-NetFirewallRule -DisplayName "Restaurant ordering (local network only)" -Direction Inbound -Protocol TCP -LocalPort 443,80,3000 -Profile Private -RemoteAddress LocalSubnet -Action Allow
   ```
7. **Turn on HTTPS** (encrypts everything between the screens and this PC):
   ```powershell
   node scripts\make-certificates.mjs
   ```
   This creates the restaurant's own certificate authority and a certificate
   for this PC's name and address, in the `certs` folder. Then make every
   screen trust it once (next section). From now on the server serves
   `https://`, and old `http://` addresses redirect automatically.
   If the PC's address ever changes, run the script again: it keeps the same
   authority, so the screens stay trusted. Keep `certs\ca.key` on this PC only.

### Trust the restaurant's certificate on each screen (once)
Without this, browsers refuse the connection with a security warning.

- **Windows (including the server PC):** right-click `scripts\trust-certificate.cmd`
  → **Run as administrator**. On other Windows screens, first copy
  `certs\restaurant-ca.crt` (from the server PC, via USB) next to the script.
  Then restart Chrome/Edge.
- **Android:** copy `restaurant-ca.crt` to the tablet (USB, or email it to
  yourself). Then **Settings → Security → Encryption & credentials** (or *More
  security settings*) **→ Install a certificate → CA certificate** → choose the
  file. Android asks for the screen lock PIN; set one if the tablet has none.
  If `.crt` is not accepted, use `restaurant-ca.cer`.
- Never copy `ca.key` or `server.key` anywhere. Only `restaurant-ca.crt`/`.cer`.
   The restaurant network must be set to **Private** in Windows
   (Settings → Network → your network → Network profile type → Private).

### Start automatically
- **Server PC that is also the kiosk:** put a shortcut to `scripts\start-kiosk-pc.cmd`
  in the Startup folder (Windows + R → `shell:startup`). It starts the server,
  waits until it is ready, then opens the kiosk full screen.
- **Separate server PC:** put a shortcut to `scripts\start-server.cmd` in the
  Startup folder. Keep its window open (minimised).
- Set the PC to sign in automatically and never sleep (KIOSK-DEVICE-SETUP.md).

## The other screens
Use the server's fixed address, e.g. `192.168.1.50`:

| Screen | Address |
|---|---|
| Kiosk on another device | `https://192.168.1.50/kiosk` |
| Kitchen display | `https://192.168.1.50/kitchen` |
| Status board (calls out takeaway orders) | `https://192.168.1.50/board` |
| Admin (manager's laptop or phone on the restaurant Wi-Fi) | `https://192.168.1.50/admin` |

On the server PC itself use `https://localhost/...`. The PC's name works too
(e.g. `https://kiosk-server/kiosk`) if the network resolves it; add extra
names when creating certificates: `node scripts\make-certificates.mjs kiosk-server`.

**Sound on the kitchen and status board (Windows):** start them with
`scripts\open-kitchen.cmd` and `scripts\open-board.cmd` (add the server
address when it is another PC, e.g. `open-board.cmd 192.168.1.50`). These open
Chrome full screen with sound allowed from the start, so nobody has to tap.
Put shortcuts to them in the Startup folder of the PCs that show those screens.
Opened any other way, browsers only allow sound after the first touch: the
screens show a bar asking for one tap, after which sound stays on.

The status board says "Order 42, ready for collection" twice when a takeaway
order is marked ready. If there is no customer screen, use **Call out ready
orders** on the kitchen display instead, with its speaker near the counter.

**Android tablets:** with HTTPS and the certificate trusted, "keep screen
on", "Add to home screen → Install" and full screen all work (see
KIOSK-DEVICE-SETUP.md). Without HTTPS they do not; then keep the tablet on its
charger with Screen timeout at maximum.

## Keeping it safe
- **Separate the networks:** connect the screens to a staff network the
  customers do not know the password for. If the restaurant offers customer
  Wi-Fi, use the router's guest network for it (guests cannot see the screens).
- **Lock the server PC:** Windows password on the admin account, BitLocker if
  available. `.env.local` holds the payment keys.
- Use the server PC for nothing else (no browsing, no email).
- Staff accounts: one per person, remove leavers in Supabase → Authentication.

## Updating
Close the server window, then run `scripts\update.cmd` (downloads the new
version, installs, rebuilds), then start the server again. If the update fails,
the previous version is still installed and keeps working.

## If something goes wrong
| Problem | What to do |
|---|---|
| Screens show "This site can't be reached" | Is the server window open on the server PC? Is the PC on the same network? |
| Screens show "Your connection is not private" | That screen does not trust the restaurant certificate yet (see "Trust the restaurant's certificate"), or the PC's address changed: run `node scripts\make-certificates.mjs` again and restart the server. |
| Kitchen says "Live updates paused" | Internet is down or slow; orders still arrive every 5 seconds once it returns. |
| Kiosk says payments cannot be reached | Internet is down: customers can still choose Pay at the counter. |
| No announcements | Tap the bar on the status board; check the TV or speaker volume. |
