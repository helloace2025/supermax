@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Local preview launcher — keeps server alive if the window stays open.
REM Proxy: only needed when Node cannot reach OpenSea/Blockscout directly.
if not defined HTTPS_PROXY set HTTPS_PROXY=http://127.0.0.1:7897
if not defined HTTP_PROXY set HTTP_PROXY=http://127.0.0.1:7897

echo.
echo  ROBIN NFT Radar — local preview
echo  folder: %cd%
echo  url:    http://127.0.0.1:3789/
echo.

REM Free port 3789 if an old node is stuck
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3789" ^| findstr "LISTENING"') do (
  echo  stopping old pid %%p on :3789
  taskkill /F /PID %%p >nul 2>&1
)

timeout /t 1 /nobreak >nul

start "" "http://127.0.0.1:3789/"

echo  starting server...  (close this window = stop preview)
echo  ----------------------------------------------------
node server/index.js
echo.
echo  server exited code %ERRORLEVEL%
pause
