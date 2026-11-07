@echo off
rem Power launcher (ASCII only + CRLF so that cmd.exe parses it reliably)
cd /d "%~dp0"
title Power

rem Install packages / rebuild only when the source has changed
node scripts\ensure-build.mjs
if errorlevel 1 goto error

call npm start
if errorlevel 1 goto error
goto :eof

:error
echo.
echo [Power] An error occurred. Please check the messages above.
pause
