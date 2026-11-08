# Setting up the kiosk screen

The kiosk works on any touchscreen with a current Chrome or Edge browser:
Windows touch PCs and all-in-ones, Android tablets, landscape or portrait.
Everything scales to the screen; portrait screens get their own layout.

Replace `https://YOUR-DOMAIN` below with the address the app is deployed to.

| Screen | URL |
|---|---|
| Customer kiosk | `https://YOUR-DOMAIN/kiosk` |
| Order status board (TV facing customers) | `https://YOUR-DOMAIN/board` |
| Kitchen display | `https://YOUR-DOMAIN/kitchen` (staff sign-in) |
| Management | `https://YOUR-DOMAIN/admin` (staff sign-in) |

Recommended screen: 1920×1080 or larger for a standing kiosk; any tablet of
10 inches or more works. Smaller screens work but everything is smaller.

---

## Windows touchscreen

### 1. Chrome in kiosk mode
Kiosk mode opens one page full screen with no address bar, tabs or close button.

1. Install Google Chrome.
2. Right-click the desktop → **New → Shortcut**. For the location, paste (one line):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://YOUR-DOMAIN/kiosk" --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI
   ```

   Name it **Kiosk**.
3. Double-click it to test. To leave kiosk mode during setup, plug in a keyboard and press **Alt + F4**.

### 2. Start automatically when the PC turns on
1. Press **Windows + R**, type `shell:startup`, press Enter.
2. Copy the **Kiosk** shortcut into the folder that opens.
3. Make Windows sign in automatically, so a power cut does not leave the kiosk at a password screen: use a dedicated local account for the kiosk with no sensitive files on it.

### 3. Windows settings
- **Settings → System → Power**: Screen and sleep → **Never** (when plugged in).
- **Settings → Time & language → Typing → Touch keyboard**: turn off showing the touch keyboard automatically. The kiosk has its own on-screen keyboard.
- **Settings → Windows Update → Advanced options**: set active hours to cover opening hours, so updates never restart the kiosk during service.
- Disable edge swipes so customers cannot reach the Start menu or notifications: on Windows Pro this is the Group Policy *Allow edge swipe* = Disabled; a kiosk account set up with **Settings → Accounts → Other users → Set up a kiosk** (Assigned Access) also locks the PC to a single app.

---

## Android tablet

### Option A: no extra software (good for most restaurants)
1. Open **Chrome** on the tablet and go to `https://YOUR-DOMAIN/kiosk`.
2. Chrome menu (⋮) → **Add to home screen** → **Install**. The kiosk now opens like an app, full screen, with no browser bars.
3. Lock the tablet to the kiosk app with **App pinning** (also called Screen pinning):
   **Settings → Security** (or *Security & privacy → More security settings*) → **App pinning** → on.
   Open the kiosk app, open the recent-apps view, tap the app icon at the top of its preview → **Pin**.
   Unpinning needs the tablet's PIN, so customers cannot leave the kiosk.
4. Keep the screen on: the kiosk already asks the browser to stay awake while it is open. Also set **Settings → Display → Screen timeout** to the longest value, and keep the tablet on its charger.

### Option B: a dedicated kiosk browser app
For several tablets, automatic start after a restart, or remote management,
use a kiosk browser from the Play Store (for example Fully Kiosk Browser).
Set its start URL to `https://YOUR-DOMAIN/kiosk` and enable its kiosk/lock mode.
Such apps are usually free to try with a paid licence per device.

---

## Kitchen and status-board screens
- **Kitchen tablet or monitor**: open `/kitchen`, sign in with a kitchen account, then tap **Tap to turn sound on** once (browsers only allow sound after a tap). Use Option A above to make it full screen; do not pin it if staff also need the tablet for other apps.
- **Status board TV**: any TV or monitor with a browser (or a small PC / streaming stick with Chrome) opened on `/board`, full screen (F11 on a PC). No sign-in needed; it shows order numbers only.

## Daily start-up checklist
1. Turn on the kiosk, kitchen screen and status board.
2. Kitchen screen: check it says **Live** in green and tap the sound button.
3. Nothing else is needed: the kiosk returns to its welcome screen by itself between customers.
4. If the kiosk shows "We are closed right now", check the opening hours in **Admin → Settings**.
