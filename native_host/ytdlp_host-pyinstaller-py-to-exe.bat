@echo off
setlocal

:: Configuration
set PY_FILE=ytdlp_host.py
set EXE_NAME=ytdlp_host.exe
set OUTPUT_DIR=C:\ProgramData\YTDownloader\native_host
set WORK_PATH=C:\ProgramData\YTDownloader\tempbuild
set ICON_PATH=C:\ProgramData\YTDownloader\native_host\icon.ico
set VERSION_FILE=C:\ProgramData\YTDownloader\native_host\ytdlp_host_version_info.txt

:: Step 1: Delete old exe if exists
if exist "%OUTPUT_DIR%\%EXE_NAME%" (
    echo Deleting old executable...
    del "%OUTPUT_DIR%\%EXE_NAME%"
)

:: Step 2: Compile with PyInstaller
echo Compiling %PY_FILE%...
python -m PyInstaller --onefile --noupx --clean "%PY_FILE%" --workpath "%WORK_PATH%" --specpath "%WORK_PATH%" --distpath "%OUTPUT_DIR%" --icon="%ICON_PATH%" --version-file="%VERSION_FILE%"
if %ERRORLEVEL% NEQ 0 (
    echo PyInstaller failed. Exiting.
    exit /b %ERRORLEVEL%
)

echo Done.
pause
