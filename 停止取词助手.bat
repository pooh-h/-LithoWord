@echo off
cd /d "%~dp0"
if not exist "tools\agent.pid" goto notrunning
set /p AGENTPID=<"tools\agent.pid"
echo 正在停止取词助手（PID %AGENTPID%）...
taskkill /PID %AGENTPID% /F >nul 2>nul
del "tools\agent.pid" >nul 2>nul
echo 已停止。Tab 快捷取词不再响应，网页仍可手动打开。
pause
exit /b

:notrunning
echo 取词助手当前没有在运行。
pause
exit /b
