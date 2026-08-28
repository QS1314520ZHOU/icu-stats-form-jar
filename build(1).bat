@echo off
setlocal

rem Clear NODE_OPTIONS to avoid safe-delete hook corrupting npm/node_modules
set NODE_OPTIONS=

cd /d "%~dp0"
set FE=%CD%\sjm1-app
set STATIC=%CD%\src\main\resources\static\form

echo ============================================================
echo   ICU Stats Form - One-Click Build
echo   (Frontend build + Static sync + Maven package)
echo ============================================================
echo.
echo NOTE: If Maven says "Failed to delete target\logs\...warn.log",
echo       the jar is still running and locking logs. Stop it first.
echo.

rem ---------- [1/4] Frontend deps ----------
echo [1/4] Check frontend dependencies...
if not exist "%FE%\node_modules" (
  echo     node_modules not found, installing first time ~3-5 min...
  pushd "%FE%"
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo npm install FAILED ^& popd ^& pause ^& exit /b 1 )
  popd
) else (
  echo     node_modules exists, skip install.
)

rem ---------- [2/4] Frontend build ----------
echo.
echo [2/4] Build frontend ng build...
pushd "%FE%"
call npm run build
if errorlevel 1 ( echo Frontend build FAILED ^& popd ^& pause ^& exit /b 1 )
popd

rem ---------- [3/4] Sync static resources ----------
echo.
echo [3/4] Sync dist to src\main\resources\static\form ...
if exist "%STATIC%" rmdir /s /q "%STATIC%"
mkdir "%STATIC%" 2>nul
robocopy "%FE%\dist\sjm1-app\browser" "%STATIC%" /e /njh /njs /ndl /np >nul
if errorlevel 8 ( echo Static sync FAILED ^& pause ^& exit /b 1 )
echo     Sync done.

rem ---------- [4/4] Maven package ----------
echo.
echo [4/4] Maven package mvn clean package -DskipTests...
pushd "%CD%"
call mvn clean package -DskipTests
if errorlevel 1 ( echo Maven package FAILED ^& popd ^& pause ^& exit /b 1 )
popd

echo.
echo ============================================================
echo   BUILD DONE
echo   Output: %CD%\target\backend-from-0.0.1.jar
echo   Start:  java -jar target\backend-from-0.0.1.jar
echo   Refresh browser: Ctrl+F5
echo ============================================================
echo.
pause
endlocal
