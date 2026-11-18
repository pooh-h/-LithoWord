$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$name = "$([char]0x5CA9)$([char]0x8BED) LithoWord.lnk"
$lnkPath = Join-Path $desktop $name

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $ps)) { $ps = "powershell.exe" }

$launch = Join-Path $root "tools\launch.ps1"
if (-not (Test-Path $launch)) { throw "missing tools\launch.ps1" }

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $ps
$lnk.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launch + '"'
$lnk.WorkingDirectory = $root
$ico = Join-Path $root "assets\app.ico"
if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
$lnk.Description = "LithoWord - geology vocabulary studio"
$lnk.WindowStyle = 1
$lnk.Save()

Write-Output ("OK: " + $lnkPath)
