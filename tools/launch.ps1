# 岩语 LithoWord —— 启动器
# 双击桌面快捷方式时执行：确保取词助手在跑，然后打开网页。
# 任何一步失败都弹窗说明原因，不会出现「打开了页面但助手没起来」这种情况。

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "data\cache"
$logFile = Join-Path $logDir "launcher.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  try { Add-Content -Path $logFile -Value $line -Encoding UTF8 } catch {}
}

function Show-Error([string]$title, [string]$msg) {
  Write-Log "ERROR: $msg"
  try {
    $ws = New-Object -ComObject WScript.Shell
    $ws.Popup($msg, 0, $title, 16) | Out-Null
  } catch {}
  exit 1
}

Write-Log "---- 启动器开始 ----"

# 端口（可在 tools\agent_config.json 里改）
$port = 8737
$cfg = Join-Path $PSScriptRoot "agent_config.json"
if (Test-Path $cfg) {
  try {
    $j = Get-Content $cfg -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.port) { $port = [int]$j.port }
  } catch { Write-Log "读取 agent_config.json 失败，用默认端口 $port" }
}

function Test-Port([int]$p) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect("127.0.0.1", $p)
    $c.Close()
    return $true
  } catch { return $false }
}

function Get-Heartbeat([int]$p) {
  try { return Invoke-RestMethod "http://127.0.0.1:$p/api/heartbeat" -TimeoutSec 2 } catch { return $null }
}

function Open-Site([int]$p) {
  # 已经有一个岩语的标签页就把它拿到前面来，不再叠一个新标签
  try {
    $sh = New-Object -ComObject WScript.Shell
    foreach ($t in @("岩语 · LithoWord", "LithoWord - Microsoft", "127.0.0.1:$p")) {
      if ($sh.AppActivate($t)) {
        Write-Log "复用已经打开的网页窗口"
        return
      }
    }
  } catch { }
  Start-Process ("http://127.0.0.1:{0}/" -f $p) | Out-Null
}

# 1) 已经在跑：直接开网页
if (Test-Port $port) {
  $hb = Get-Heartbeat $port
  if ($hb) {
    Write-Log ("助手已在运行 v{0} pid={1}，直接打开网页" -f $hb.version, $hb.pid)
    Open-Site $port
    exit 0
  }
  $msg = "端口 {0} 被别的程序占着，但那个程序不响应取词接口。`n`n请先关掉占用该端口的程序，或在 tools\agent_config.json 里换一个端口。" -f $port
  Show-Error "岩语 LithoWord" $msg
}

# 2) 找 pythonw.exe（无窗口解释器）
function Find-Pythonw {
  $c = Get-Command pythonw.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }

  $p = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($p) {
    $w = Join-Path (Split-Path $p.Source) "pythonw.exe"
    if (Test-Path $w) { return $w }
  }

  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) {
    try {
      $exe = (& $py.Source -3 -c "import sys;print(sys.executable)" 2>$null | Select-Object -First 1)
      if ($exe) {
        $w = Join-Path (Split-Path $exe.Trim()) "pythonw.exe"
        if (Test-Path $w) { return $w }
      }
    } catch {}
  }

  $globs = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python*\pythonw.exe"),
    "C:\Python*\pythonw.exe",
    (Join-Path $env:ProgramFiles "Python*\pythonw.exe")
  )
  foreach ($g in $globs) {
    $hit = Get-ChildItem $g -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

$pythonw = Find-Pythonw
if (-not $pythonw) {
  $site = Join-Path $root "index.html"
  Write-Log "没找到 pythonw.exe，退化为直接打开本地页面"
  Start-Process $site | Out-Null
  Show-Error "岩语 LithoWord" "没找到 Python（pythonw.exe）。`n`n页面已经用本地文件方式打开了，但离线词典和 Tab 取词需要 Python 才能用。`n装好 Python 3 后重新双击桌面图标即可。"
}

# 3) 启动助手（隐藏窗口，独立于任何控制台）
Write-Log ("用 {0} 启动 tools\desktop_agent.py" -f $pythonw)
$agentLog = Join-Path $root "tools\agent.log"
try {
  Start-Process -FilePath $pythonw `
    -ArgumentList @("tools\desktop_agent.py") `
    -WorkingDirectory $root `
    -WindowStyle Hidden | Out-Null
} catch {
  Show-Error "岩语 LithoWord" ("启动取词助手失败：`n{0}" -f $_.Exception.Message)
}

# 4) 等它就绪（最多 20 秒）
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Port $port) {
    $hb = Get-Heartbeat $port
    if ($hb) { $ok = $true; break }
  }
}

if ($ok) {
  Write-Log ("助手就绪 v{0} pid={1}，打开网页" -f $hb.version, $hb.pid)
  Open-Site $port
  exit 0
}

# 5) 失败：把日志尾巴给用户看
$tail = ""
foreach ($f in @($agentLog, (Join-Path $logDir "launcher.log"))) {
  if (Test-Path $f) {
    $tail += ("`n--- " + (Split-Path $f -Leaf) + " ---`n")
    $tail += ((Get-Content $f -Tail 12 -Encoding UTF8 -ErrorAction SilentlyContinue) -join "`n")
  }
}
Show-Error "岩语 LithoWord" ("取词助手没能在 20 秒内启动，端口 {0} 仍无响应。`n{1}`n`n常见原因：Python 装到了别的账户下、杀毒软件拦截、或 8737 端口被占用。`n日志：{2}" -f $port, $tail, $logFile)
