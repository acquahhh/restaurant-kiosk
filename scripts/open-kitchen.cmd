@echo off
rem Opens the kitchen display full screen with sound allowed from the start
rem (no tap needed). Usage: open-kitchen.cmd [server address]
rem   e.g. open-kitchen.cmd 192.168.1.50   (default: this PC)
set SERVER=%~1
if "%SERVER%"=="" set SERVER=localhost
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "http://%SERVER%:3000/kitchen" --autoplay-policy=no-user-gesture-required --no-first-run --disable-features=TranslateUI --user-data-dir="%LOCALAPPDATA%\RestaurantKitchenScreen"
