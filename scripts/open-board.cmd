@echo off
rem Opens the customer status board full screen with spoken announcements
rem allowed from the start (no tap needed). Usage: open-board.cmd [server address]
rem Needs the restaurant certificate trusted on this PC (trust-certificate.cmd).
set SERVER=%~1
if "%SERVER%"=="" set SERVER=localhost
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "https://%SERVER%/board" --autoplay-policy=no-user-gesture-required --no-first-run --disable-features=TranslateUI --user-data-dir="%LOCALAPPDATA%\RestaurantStatusBoard"
