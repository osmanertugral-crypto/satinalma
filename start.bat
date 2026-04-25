@echo off
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
echo Satinalma Yonetim Sistemi baslatiliyor...
echo Server: http://localhost:3001
echo Client: http://localhost:5173
echo Kapatmak icin: Ctrl+C
echo.
node "%~dp0launch.js"
