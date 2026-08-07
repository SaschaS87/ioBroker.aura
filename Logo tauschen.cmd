@echo off
REM Doppelklick-Starter fuer den Aura-Logo-Assistenten.
REM Kann kopiert oder als Verknuepfung auf den Desktop gelegt werden -
REM der Pfad unten zeigt immer auf den Ordner, in dem diese Datei liegt.
cd /d "%~dp0"
title Aura - Logo tauschen
call npm run logo
echo.
echo ----------------------------------------------------------------
echo Fertig. Fenster kann geschlossen werden.
echo.
pause
