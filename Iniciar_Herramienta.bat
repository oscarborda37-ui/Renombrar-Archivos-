@echo off
chcp 65001 > nul
title Herramienta de Renombrado Masivo Alfanumérico - Levapan
cls

echo ======================================================================
echo    HERRAMIENTA PROFESIONAL DE RENOMBRADO MASIVO ALFANUMÉRICO
echo                         Levapan S.A.
echo ======================================================================
echo.
echo Iniciando entorno local y abriendo en Microsoft Edge...
echo.

:: Intentar iniciar con el servidor PowerShell para habilitar File System API
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0server.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [AVISO] Iniciando modo directo en navegador...
    start msedge "%~dp0index.html"
)

pause
