@echo off
rem LithoWord launcher (ASCII only on purpose: no code page issues)
rem All real work lives in tools\launch.ps1 so the desktop shortcut and this
rem file behave exactly the same way.
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\launch.ps1"
exit /b
