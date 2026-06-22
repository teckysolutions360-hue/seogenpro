@echo off
REM setup-sitemap-system.bat
REM Quick setup script for Dynamic Sitemap System 2.0 (Windows)

setlocal enabledelayedexpansion

cls
echo ================================================
echo Dynamic Sitemap System 2.0 - Setup Script
echo ================================================
echo.

REM Check if we're in the right directory
if not exist "server.js" (
  echo Error: This script must be run from the server directory
  echo Current directory: %cd%
  exit /b 1
)

echo / Running from server directory
echo.

REM Step 1: Install dependencies
echo Step 1: Installing dependencies...
call npm install node-cron
if !errorlevel! equ 0 (
  echo / Dependencies installed
) else (
  echo X npm install failed
  exit /b 1
)
echo.

REM Step 2: Verify module structure
echo Step 2: Verifying sitemap system files...
set SITEMAP_DIR=src\services\sitemap
set MISSING_FILES=0

for %%f in (
  "sitemap-config.js"
  "url-fetcher.js"
  "rules-engine.js"
  "cache-manager.js"
  "sitemap-builder.js"
  "scheduler.js"
  "sitemap-system.js"
  "sitemap-admin-routes.js"
) do (
  if exist "%SITEMAP_DIR%\%%~f" (
    echo   / %%~f
  ) else (
    echo   X %%~f ^(MISSING^)
    set /a MISSING_FILES+=1
  )
)

if !MISSING_FILES! gtr 0 (
  echo.
  echo Error: !MISSING_FILES! required files are missing
  exit /b 1
)
echo / All required files present
echo.

REM Step 3: Verify Node.js syntax
echo Step 3: Verifying Node.js syntax...
node -c server.js >nul 2>&1 && (echo   / server.js syntax OK) || (echo   X server.js syntax error)
node -c src\services\sitemap\sitemap-config.js >nul 2>&1 && (echo   / sitemap-config.js syntax OK) || (echo   X sitemap-config.js syntax error)
node -c src\services\sitemap\sitemap-system.js >nul 2>&1 && (echo   / sitemap-system.js syntax OK) || (echo   X sitemap-system.js syntax error)
echo.

REM Step 4: Summary
echo ================================================
echo / Setup Complete!
echo ================================================
echo.
echo Next steps:
echo 1. Review configuration: SITEMAP_SYSTEM_INTEGRATION.md
echo 2. Start server: npm run dev
echo 3. Test health: curl http://localhost:3000/api/sitemap/admin/status
echo 4. View sitemap: curl http://localhost:3000/sitemap.xml
echo.
echo For full documentation, see: SITEMAP_SYSTEM_INTEGRATION.md
echo.

pause
