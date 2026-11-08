@echo off
rem Runs the restaurant app for every screen on the restaurant network.
rem Keep this window open (minimise it). Closing it stops ordering.
rem Uses HTTPS when certificates exist (node scripts\make-certificates.mjs).
title Restaurant ordering server - keep open
cd /d "%~dp0\.."
if not exist ".next\BUILD_ID" (
  echo First start: building the app, this takes a few minutes...
  call npm run build || (echo BUILD FAILED & pause & exit /b 1)
)
:run
if exist "certs\server.crt" (
  call npm run serve:https
) else (
  echo No HTTPS certificates yet: serving plain http on port 3000.
  call npm run serve
)
echo The server stopped. Restarting in 5 seconds (close this window to stop it)...
timeout /t 5 /nobreak >nul
goto run
