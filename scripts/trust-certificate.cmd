@echo off
rem Makes this Windows PC trust the restaurant's HTTPS certificates (Chrome and
rem Edge use the Windows certificate store). Run once on every Windows screen.
rem Right-click this file and choose "Run as administrator".
rem On screens other than the server PC, copy restaurant-ca.crt next to this
rem file first (or into a "certs" folder beside the scripts folder).
set CA=%~dp0..\certs\restaurant-ca.crt
if not exist "%CA%" set CA=%~dp0restaurant-ca.crt
if not exist "%CA%" (
  echo restaurant-ca.crt not found. On the server PC run:  node scripts\make-certificates.mjs
  pause & exit /b 1
)
certutil -addstore -f Root "%CA%"
if errorlevel 1 (
  echo.
  echo Could not add the certificate. Right-click this file and choose "Run as administrator".
  pause & exit /b 1
)
echo.
echo This PC now trusts the restaurant's HTTPS certificates. Restart Chrome/Edge.
pause
