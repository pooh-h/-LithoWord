@echo off
cd /d "%~dp0.."
title 岩语 LithoWord 取词助手（控制台）
where python >nul 2>nul
if errorlevel 1 (
  echo 未找到 Python。请安装 Python 3.9+ 后重试，或直接双击 index.html 使用网页版。
  pause
  exit /b
)
python "tools\desktop_agent.py"
pause
