@echo off
rem For a PC that is both the server and the customer kiosk screen.
rem Starts the server, waits until it answers, then opens the kiosk full screen.
cd /d "%~dp0"
start "Restaurant ordering server - keep open" /min cmd /c start-server.cmd
set URL=http://localhost:3000/kiosk
set PORT=3000
if exist "%~dp0..\certs\server.crt" (set URL=https://localhost/kiosk& set PORT=443)
echo Waiting for the ordering server to start...
powershell -NoProfile -Command "for ($i = 0; $i -lt 180; $i++) { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', %PORT%); $c.Close(); Start-Sleep 3; exit 0 } catch { Start-Sleep 2 } }; exit 1"
if errorlevel 1 (echo The server did not start. Check the server window. & pause & exit /b 1)
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk "%URL%" --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI
