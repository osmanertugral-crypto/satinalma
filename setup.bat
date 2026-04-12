@echo off
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
echo Satinalma Yonetim Sistemi - Ilk Kurulum
echo ==========================================
echo.

echo Node.js yuklu mu kontrol ediliyor...
node --version >nul 2>&1
if errorlevel 1 (
  echo HATA: Node.js bulunamadi!
  echo Lutfen https://nodejs.org adresinden Node.js indirip y�kleyin.
  pause
  exit /b 1
)
echo Node.js: OK

echo.
echo [1/2] Server bagimliliklar� yukleniyor...
cd /d "%~dp0server"
call npm install
if errorlevel 1 (
  echo HATA: Server bagimliliklar� yuklenemedi!
  pause
  exit /b 1
)
echo Server: OK

echo.
echo [2/2] Client bagimliliklar� yukleniyor...
cd /d "%~dp0client"
call npm install
if errorlevel 1 (
  echo HATA: Client bagimliliklar� yuklenemedi!
  pause
  exit /b 1
)
echo Client: OK

echo.
echo ==========================================
echo Kurulum tamamlandi!
echo.
echo Gelistirme icin : start.bat
echo Sunucu (uretim) icin : start_prod.bat
echo ==========================================
pause
