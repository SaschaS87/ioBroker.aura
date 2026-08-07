@echo off
REM Doppelklick-Starter fuer den Aura-Logo-Assistenten.
REM
REM Diese Datei gehoert in den Projektordner (dort, wo package.json liegt).
REM Fuer den Desktop entweder eine VERKNUEPFUNG anlegen (Rechtsklick ->
REM "Verknuepfung erstellen", dann verschieben) oder die Datei kopieren -
REM beides funktioniert, weil sie den Projektordner notfalls selbst sucht.
cd /d "%~dp0"
title Aura - Logo tauschen

REM Liegt das Projekt hier? Sonst auf den bekannten Ort ausweichen (z.B. wenn
REM diese Datei auf den Desktop kopiert wurde).
if not exist "package.json" (
  if exist "%USERPROFILE%\Dev\ioBroker.aura\package.json" (
    cd /d "%USERPROFILE%\Dev\ioBroker.aura"
  ) else (
    echo.
    echo Das Aura-Projekt wurde nicht gefunden.
    echo Erwartet wurde es hier: %USERPROFILE%\Dev\ioBroker.aura
    echo.
    echo Diese Datei am besten in den Projektordner legen oder eine
    echo Verknuepfung darauf verwenden.
    echo.
    pause
    exit /b 1
  )
)

echo Projektordner: %CD%
call npm run logo
echo.
echo ----------------------------------------------------------------
echo Fertig. Fenster kann geschlossen werden.
echo.
pause
