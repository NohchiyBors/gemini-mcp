@echo off
echo ===============================
echo Starting Gemini MCP Setup...
echo ===============================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please download and install Node.js from:  https://nodejs.org/
    echo After installing, close this window and try running setup.bat again.
    echo ===============================
    pause
    exit /b 1
)

node setup.js
pause
