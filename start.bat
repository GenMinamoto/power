@echo off
rem Power launcher (ASCII only + CRLF so that cmd.exe parses it reliably)
cd /d "%~dp0"
title Power

if not exist node_modules (
  echo [Power] First run: installing packages...
  call npm install
  if errorlevel 1 goto error
)
if not exist dist\server\server\index.js goto build
if not exist dist\client\index.html goto build
goto run

:build
echo [Power] Building...
call npm run build
if errorlevel 1 goto error

:run
call npm start
if errorlevel 1 goto error
goto :eof

:error
echo.
echo [Power] An error occurred. Please check the messages above.
pause
