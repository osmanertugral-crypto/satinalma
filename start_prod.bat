@echo off
echo Satinalma - Production Build & Start
echo.

echo [1/2] Client build aliniyor...
cd /d "%~dp0client"
call npm run build
if errorlevel 1 (
  echo HATA: Client build basarisiz!
  pause
  exit /b 1
)

echo.
echo [2/2] Sunucu baslatiliyor (production)...
cd /d "%~dp0server"
set NODE_ENV=production
start "Satinalma - Server" cmd /k "cd /d "%~dp0server" && set NODE_ENV=production && node index.js"

timeout /t 3 /nobreak > nul

echo.
echo Uygulama baslatildi!
echo Adres: http://localhost:3001
echo Agdaki diger makineler: http://SUNUCU_IP:3001
echo.
echo Sunucu IP adresini ogrenin: ipconfig
start http://localhost:3001
pause