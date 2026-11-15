@echo off
echo ================================================================
echo   STARTING DIGITAL LITERACY ASSESSMENT SYSTEM (DLAS)
echo   Masbate Colleges - College of Computer Studies
echo ================================================================
echo.

echo [1/2] Launching Backend Server on port 3000...
start cmd /k "cd /d %~dp0server && npm start"

timeout /t 2 /nobreak >nul

echo [2/2] Launching Frontend Application on port 5173...
start cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo Both services launched!
echo - Frontend UI: http://localhost:5173
echo - Backend API: http://localhost:3000
echo.
echo Demo Accounts:
echo - Admin:   admin@dlas.edu.ph       / Admin@123
echo - Student: maria.santos@example.com / User@123
echo ================================================================

