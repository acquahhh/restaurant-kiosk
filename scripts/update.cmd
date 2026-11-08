@echo off
rem Fetch the latest version and rebuild. Run after closing the server window.
cd /d "%~dp0\.."
git restore package-lock.json
git pull || goto :fail
call npm ci || goto :fail
call npm run build || goto :fail
echo.
echo Update complete. Start the server again (start-server.cmd).
pause
exit /b 0
:fail
echo.
echo UPDATE FAILED. The previous version is still installed. Send the messages above to your developer.
pause
exit /b 1
