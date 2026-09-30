<#
SkillHub Helper v2.0.5 安装包最终验证脚本（管理员运行）

执行内容：
  1. 卸载可能残留的旧版本（NSIS + MSI）
  2. NSIS 静默安装
  3. MSI 静默安装（覆盖 NSIS，作为最终状态）
  4. 验证 %ProgramFiles%\SkillHub\skillhub-helper.exe 落地
  5. 验证落地 exe 的 PE Subsystem（防止 Tauri 异常让 console 漏出）
  6. 验证注册表 Uninstall 项的 InstallLocation

使用方法：右键 PowerShell → 以管理员身份运行 → 执行：
  PS> d:\BigLionX\SkillHub\.tools\install-helper-and-verify.ps1
#>

$ErrorActionPreference = 'Stop'
$exeRoot  = 'd:\BigLionX\SkillHub\apps\helper\src-tauri\target\release'
$exe      = Join-Path $exeRoot 'skillhub-helper.exe'
$msi      = Join-Path $exeRoot 'bundle\msi\SkillHub_2.0.5_x64_zh-CN.msi'
$nsis     = Join-Path $exeRoot 'bundle\nsis\SkillHub_2.0.5_x64-setup.exe'
$expected = Join-Path $env:ProgramFiles 'SkillHub'

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ' SkillHub Helper v2.0.5 真实安装路径验证' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan

# --- 0. 产物检查 ----------------------------------------------------
foreach ($p in @($exe, $msi, $nsis)) {
    if (-not (Test-Path $p)) { Write-Host "[FAIL] missing: $p" -ForegroundColor Red; exit 1 }
}
$whoami = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($whoami)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host '[FAIL] 需要管理员权限运行本脚本（右键 PowerShell → 以管理员身份运行）' -ForegroundColor Red
    exit 1
}

# --- 1. 卸载残留 -----------------------------------------------------
$prodNameTarget = 'SkillHub'
Write-Host "`n[1/5] 检查/卸载残留 ..." -ForegroundColor Yellow
$regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
$existing = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq $prodNameTarget }
if ($existing) {
    Write-Host "  发现已安装：$($existing.DisplayName) ($($existing.DisplayVersion))"
    Write-Host "  -> 用 MSI 卸载（清理注册表）"
    $proc = Start-Process -FilePath 'msiexec' -ArgumentList '/x',"`"$($existing.PSChildName)`"",'/qn','REBOOT=ReallySuppress' -Wait -PassThru -NoNewWindow
    Write-Host "  exit code = $($proc.ExitCode)"
} else {
    Write-Host '  无残留'
}

if (Test-Path $expected) {
    Write-Host "  残留目录 $expected 还在（可能是 NSIS 安装的，未在 MSI 卸载范围），手工删除..."
    Remove-Item -Recurse -Force $expected
}

# --- 2. NSIS 静默安装 -------------------------------------------------
Write-Host "`n[2/5] NSIS 静默安装 (/S) ..." -ForegroundColor Yellow
$proc = Start-Process -FilePath $nsis -ArgumentList '/S' -Wait -PassThru -NoNewWindow
Write-Host "  NSIS exit code = $($proc.ExitCode)  (0 = 成功)"
if ($proc.ExitCode -ne 0) {
    Write-Host '[FAIL] NSIS 安装失败' -ForegroundColor Red
    exit 1
}

# NSIS 后确认落地
Start-Sleep -Seconds 2
if (-not (Test-Path (Join-Path $expected 'skillhub-helper.exe'))) {
    Write-Host '[FAIL] NSIS 安装后未发现落地 exe' -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] NSIS 落地到 $expected" -ForegroundColor Green

# --- 3. MSI 静默安装（覆盖 NSIS） ------------------------------------
Write-Host "`n[3/5] MSI 静默安装 (/qn) ..." -ForegroundColor Yellow
$msiLog = Join-Path $env:TEMP "skillhub-msi-install-$PID.log"
$proc = Start-Process -FilePath 'msiexec' -ArgumentList @(
    '/i', "`"$msi`"",
    '/qn',
    '/L*V', "`"$msiLog`"",
    'REBOOT=ReallySuppress'
) -Wait -PassThru -NoNewWindow
Write-Host "  MSI  exit code = $($proc.ExitCode)  (0 = 成功，需要重启=3010)"
Write-Host "  日志: $msiLog"
if ($proc.ExitCode -ne 0) {
    Write-Host "[FAIL] MSI 安装失败，查看日志: $msiLog" -ForegroundColor Red
    Get-Content $msiLog -Tail 30 | ForEach-Object { Write-Host "    $_" }
    exit 1
}

# --- 4. 验证文件落地 -------------------------------------------------
Write-Host "`n[4/5] 验证落地文件 ..." -ForegroundColor Yellow
$installed = Join-Path $expected 'skillhub-helper.exe'
if (-not (Test-Path $installed)) {
    Write-Host "[FAIL] 未找到落地文件 $installed" -ForegroundColor Red
    exit 1
}
$sz = (Get-Item $installed).Length
Write-Host "  [OK] $installed  ($sz bytes)"

# 落地 exe 的 PE Subsystem 必须 = 2（防止 Tauri 异常导致 console 漏出）
$bytes = [System.IO.File]::ReadAllBytes($installed)
$peOff = [BitConverter]::ToInt32($bytes, 0x3C)
$optOff = $peOff + 24
$magic = [BitConverter]::ToUInt16($bytes, $optOff + 0x00)
$subsys = [BitConverter]::ToUInt16($bytes, $optOff + 0x44)
if ($subsys -eq 2) {
    Write-Host "  [OK] 落地 exe Subsystem = WINDOWS_GUI（无黑窗口）" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] 落地 exe Subsystem = $subsys（会有黑窗口！）" -ForegroundColor Red
    exit 1
}

# --- 5. 注册表 Uninstall 验证 ---------------------------------------
Write-Host "`n[5/5] 注册表 Uninstall 验证 ..." -ForegroundColor Yellow
$entries = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue |
           Where-Object { $_.DisplayName -eq $prodNameTarget }
if (-not $entries) {
    Write-Host '  [FAIL] HKLM 未找到 SkillHub Uninstall 项' -ForegroundColor Red
    exit 1
}
foreach ($e in $entries) {
    Write-Host "  DisplayName      : $($e.DisplayName)"
    Write-Host "  DisplayVersion   : $($e.DisplayVersion)"
    Write-Host "  Publisher        : $($e.Publisher)"
    Write-Host "  InstallLocation  : $($e.InstallLocation)"
    Write-Host "  UninstallString  : $($e.UninstallString)"
    Write-Host "  EstimatedSize    : $($e.EstimatedSize) KB"

    if ($e.InstallLocation -eq $expected) {
        Write-Host "  [OK] InstallLocation = $expected" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] InstallLocation = $($e.InstallLocation), expected $expected" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host ' 全部验证通过 ✅' -ForegroundColor Green
Write-Host " 安装路径: $expected" -ForegroundColor Green
Write-Host ' 卸载命令: msiexec /x {D79BCAE6-FC71-438C-9556-B0729A6D7929} /qn' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
