@echo off
setlocal
cd /d "%~dp0"

echo Setting up MiniMax Music 3 Studio...
if not exist "python\venv\Scripts\python.exe" py -3.11 -m venv "python\venv"
if errorlevel 1 goto :failed
"python\venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :failed
"python\venv\Scripts\python.exe" -m pip install -r "python\requirements.txt"
if errorlevel 1 goto :failed

echo.
echo Installing the private GPU runtime...
"python\venv\Scripts\python.exe" "python\install_engine.py"
if errorlevel 1 goto :failed
if not exist "python\runtime\Scripts\python.exe" py -3.11 -m venv "python\runtime"
if errorlevel 1 goto :failed
"python\runtime\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :failed
"python\runtime\Scripts\python.exe" -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130
if errorlevel 1 goto :failed
"python\runtime\Scripts\python.exe" -m pip install -r "python\engine-requirements.txt" huggingface_hub
if errorlevel 1 goto :failed

echo.
echo Downloading the three optimized MiniMax Music 3 models (about 11.1 GiB)...
"python\runtime\Scripts\python.exe" "python\download_models.py"
if errorlevel 1 goto :failed
call npm install
if errorlevel 1 goto :failed
call npm run tauri build -- --no-bundle
if errorlevel 1 goto :failed
copy /y "src-tauri\target\release\minimax-music3-studio.exe" "MiniMax Music 3 Studio.exe" >nul
echo.
echo Setup complete. MiniMax Music 3 is fully local and standalone.
pause
exit /b 0

:failed
echo.
echo Setup failed. Review the error above.
pause
exit /b 1
