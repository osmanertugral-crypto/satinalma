@echo off
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
echo Satinalma Yonetim Sistemi baslatiliyor...
echo.

start "Satinalma - Server" cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 2 /nobreak > nul

start "Satinalma - Client" cmd /k "cd /d "%~dp0client" && npm run dev"
timeout /t 4 /nobreak > nul

start http://localhost:5173

echo Uygulama baslatildi!
echo Server: http://localhost:3001
echo Client: http://localhost:5173
echo.
echo Kapatmak icin her iki terminal penceresini de kapatin.
pause