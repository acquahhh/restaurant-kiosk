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
   Set `NEXT_PUBLIC_APP_URL=http://SERVER-IP:3000` (see step 5).
   Use **live** Paystack keys only on this PC, never in code or chat.
4. Build once: `npm run build`.
5. Give the PC a fixed address on the network: in the router's admin page,
   reserve an IP for it (DHCP reservation), e.g. `192.168.1.50`. Find the
   current one with `ipconfig` (IPv4 Address of the Wi-Fi or Ethernet adapter).
6. Allow the other screens to reach it, from the local network only
   (PowerShell **as Administrator**):
   ```powershell
   New-NetFirewallRule -DisplayName "Restaurant ordering (local network only)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -RemoteAddress LocalSubnet -Action Allow
   ```
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
| Kiosk on another device | `http://192.168.1.50:3000/kiosk` |
| Kitchen display | `http://192.168.1.50:3000/kitchen` |
| Status board (calls out takeaway orders) | `http://192.168.1.50:3000/board` |
| Admin (manager's laptop or phone on the restaurant Wi-Fi) | `http://192.168.1.50:3000/admin` |

On the server PC itself use `http://localhost:3000/...`.

**Status board sound:** after the board starts, tap the bar at the bottom once
("Tap here to turn on announcements"). Browsers only allow sound after a tap.
It then says "Order 42, ready for collection" twice when a takeaway order is
marked ready. If there is no customer screen, use **Call out ready orders** on
the kitchen display instead, and place its speaker near the counter.

**Android tablets over the local network:** browsers only allow "keep screen
on" and "install as app" for secure addresses, which a local `http://` address
is not. Either keep the tablet on its charger with Screen timeout at maximum
(or Developer options → Stay awake), or in Chrome open
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add
`http://192.168.1.50:3000`, enable it and relaunch Chrome. A kiosk browser app
(KIOSK-DEVICE-SETUP.md, option B) keeps the screen on by itself.

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
| Kitchen says "Live updates paused" | Internet is down or slow; orders still arrive every 5 seconds once it returns. |
| Kiosk says payments cannot be reached | Internet is down: customers can still choose Pay at the counter. |
| No announcements | Tap the bar on the status board; check the TV or speaker volume. |
