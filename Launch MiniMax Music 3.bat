@echo off
setlocal
cd /d "%~dp0"
if exist "MiniMax Music 3 Studio.exe" (
  start "" "MiniMax Music 3 Studio.exe"
  exit /b 0
)
if exist "src-tauri\target\release\minimax-music3-studio.exe" (
  start "" "src-tauri\target\release\minimax-music3-studio.exe"
  exit /b 0
)
echo ERROR: MiniMax Music 3 Studio.exe is missing. Run Setup MiniMax Music 3.bat.
pause
exit /b 1

