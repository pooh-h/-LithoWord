@echo off
cd /d "%~dp0"
title 创建桌面快捷方式
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\make_shortcut.ps1"
if errorlevel 1 (
  echo.
  echo 创建失败。可以手动右键「启动.bat」- 发送到 - 桌面快捷方式。
) else (
  echo.
  echo 完成。桌面上已出现「岩语 LithoWord」。
)
pause
