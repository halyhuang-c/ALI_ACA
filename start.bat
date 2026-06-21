@echo off
setlocal

cd /d "%~dp0"

echo ============================================================
echo   ALI_ACA - One Click Start
echo ============================================================
echo.

if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Backend venv not found: backend\.venv
    echo Please run in backend dir: python -m venv .venv  then  install deps
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [INFO] Frontend deps missing, running npm install ...
    pushd frontend
    call npm install
    popd
)

echo [1/2] Starting backend (FastAPI, http://localhost:8000) ...
start "ALI_ACA Backend" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

echo [2/2] Starting frontend (Vite, http://localhost:5173) ...
start "ALI_ACA Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================================
echo   Both services started in separate windows
echo   Backend docs:  http://localhost:8000/docs
echo   Frontend UI:   http://localhost:5173
echo   To stop: close the corresponding windows
echo ============================================================
echo.
echo Opening frontend in 5 seconds ...
timeout /t 5 /nobreak >nul
start http://localhost:5173

endlocal
