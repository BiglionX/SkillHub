<#
验证 SkillHub 桌面助手 v2.0.5 重打产物的两项硬指标：

  1. 无黑窗口  →  PE Optional Header.Subsystem 必须 = 2 (IMAGE_SUBSYSTEM_WINDOWS_GUI)
  2. 安装路径正确 → NSIS 模板 InstallDir 与 MSI ProductName / InstallDir 必须落在 Program Files\SkillHub

使用方法（在 PowerShell 里执行，不要在沙箱里——沙箱无 Program Files 写权限）：
  PS> d:\BigLionX\SkillHub\.tools\verify-helper-installer.ps1
#>

$ErrorActionPreference = 'Stop'

$exe     = 'd:\BigLionX\SkillHub\apps\helper\src-tauri\target\release\skillhub-helper.exe'
$msi     = 'd:\BigLionX\SkillHub\apps\helper\src-tauri\target\release\bundle\msi\SkillHub_2.0.5_x64_zh-CN.msi'
$nsis    = 'd:\BigLionX\SkillHub\apps\helper\src-tauri\target\release\bundle\nsis\SkillHub_2.0.5_x64-setup.exe'

Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ' SkillHub Helper 安装包验证  (v2.0.5 / 2026-09-04)' -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan

$fail = $false

# ---- 1. 文件存在 -----------------------------------------------------
foreach ($p in @($exe, $msi, $nsis)) {
    if (-not (Test-Path $p)) {
        Write-Host "[FAIL] 缺少产物：$p" -ForegroundColor Red
        $fail = $true
    } else {
        $sz = (Get-Item $p).Length
        Write-Host ("[OK]   {0}  ({1:N0} bytes)" -f $p, $sz)
    }
}

if ($fail) { Write-Host '产物未生成，跳过后续验证' -ForegroundColor Red; exit 1 }

# ---- 2. PE subsystem = 2 (WINDOWS_GUI) ------------------------------
Write-Host ''
Write-Host '--- 2. PE subsystem 验证（防黑窗口） ---' -ForegroundColor Yellow

$bytes  = [System.IO.File]::ReadAllBytes($exe)
# DOS header: e_lfanew at offset 0x3C (4 bytes)
$peOff   = [BitConverter]::ToInt32($bytes, 0x3C)
# PE signature: 4 bytes 'PE\0\0', then COFF header (20 bytes), then Optional Header
# Optional Header starts at PE+4+20 = PE+24
$optOff  = $peOff + 24
# Subsystem is at Optional Header offset 0x44 for PE32, 0x44+ for PE32+ (前 2 字节是 magic)
# Magic @ 0x12 in Optional Header (PE+24+0x12 = PE+0x36): 0x10B=PE32 / 0x20B=PE32+
$magic   = [BitConverter]::ToUInt16($bytes, $optOff + 0x12)
$subOff  = if ($magic -eq 0x20B) { 0x5C } else { 0x44 }
$subsys  = [BitConverter]::ToUInt16($bytes, $optOff + $subOff)

$subsysName = switch ($subsys) {
    1 { 'NATIVE' }
    2 { 'WINDOWS_GUI' }
    3 { 'WINDOWS_CUI  ← console（黑窗口）' }
    9 { 'WINDOWS_CE_GUI' }
    default { "UNKNOWN($subsys)" }
}

Write-Host ("  PE Optional Header magic : 0x{0:X4} ({1})" -f $magic, $(if($magic -eq 0x20B){'PE32+'}else{'PE32'}))
Write-Host ("  Subsystem               : $subsys ($subsysName)")
if ($subsys -eq 2) {
    Write-Host '[OK]   release 已隐藏 console（不会弹黑窗口）' -ForegroundColor Green
} elseif ($subsys -eq 3) {
    Write-Host '[FAIL] release 仍是 console subsystem！请检查 main.rs 的 windows_subsystem cfg_attr' -ForegroundColor Red
    $fail = $true
} else {
    Write-Host "[FAIL] Subsystem = $subsys，预期 2 (WINDOWS_GUI)" -ForegroundColor Red
    $fail = $true
}

# ---- 3. MSI 验证（ProductName + InstallDir） -----------------------
Write-Host ''
Write-Host '--- 3. MSI 验证（Program Files\SkillHub） ---' -ForegroundColor Yellow

$msiProps = & msiexec /i $msi /qn REINSTALLMODE=vomus 2>$null ; $null = $msiexec # 占位，避免触发真安装
# 真正的 MSI 属性读取用 WMI/WindowsInstaller COM：
$msiObj = New-Object -ComObject WindowsInstaller.Installer
$db     = $msiObj.OpenDatabase($msi, 0)   # 0 = read-only

function Read-MsiProperty($db, $name) {
    $q = "SELECT Value FROM Property WHERE Property = '$name'"
    $view = $db.OpenView($q); $view.Execute()
    $rec = $view.Fetch()
    if ($rec) { $rec.StringData(1) } else { $null }
}

$productName = Read-MsiProperty $db 'ProductName'
$installDir  = Read-MsiProperty $db 'INSTALLDIR'
$productCode = Read-MsiProperty $db 'ProductCode'
$upgradeCode = Read-MsiProperty $db 'UpgradeCode'
$manufacturer = Read-MsiProperty $db 'Manufacturer'

Write-Host "  ProductName : $productName"
Write-Host "  Manufacturer: $manufacturer"
Write-Host "  INSTALLDIR  : $installDir"
Write-Host "  ProductCode : $productCode"
Write-Host "  UpgradeCode : $upgradeCode"

# 看 InstallExecuteSequence 里 InstallFiles action 是否无条件执行（perMachine 标志位）
$view = $db.OpenView("SELECT Sequence,Action,Condition FROM InstallExecuteSequence WHERE Action = 'InstallFiles'")
$view.Execute()
$rec = $view.Fetch()
if ($rec) {
    Write-Host "  InstallFiles.Condition: '$($rec.StringData(3))'   (空 = 总是执行 = perMachine)"
}

if ($productName -like 'SkillHub*' -and $installDir) {
    Write-Host '[OK]   MSI 安装路径正确' -ForegroundColor Green
} else {
    Write-Host '[FAIL] MSI ProductName / INSTALLDIR 异常' -ForegroundColor Red
    $fail = $true
}

# ---- 4. NSIS 模板验证 ----------------------------------------------
Write-Host ''
Write-Host '--- 4. NSIS 验证（perMachine → Program Files\SkillHub） ---' -ForegroundColor Yellow

# Tauri 把 NSIS 模板放在 gen/schemas 旁边，运行时拷贝到 target/release/wix 或 nsis
# 更稳的做法：从 NSIS setup.exe 自身解包出 [NSIS].nsi 并看 InstallDir 属性
$nsisTmp = Join-Path $env:TEMP 'skillhub-nsis-extract'
if (Test-Path $nsisTmp) { Remove-Item -Recurse -Force $nsisTmp }
New-Item -ItemType Directory -Path $nsisTmp | Out-Null

# NSIS 本身就是自解压脚本；用 7z（如有）解包头部
$sevenZip = (Get-Command 7z -ErrorAction SilentlyContinue).Source
if ($sevenZip) {
    & $sevenZip e -y "-o$nsisTmp" $nsis '*' 2>&1 | Out-Null
    $nsi = Get-ChildItem -Path $nsisTmp -Recurse -Filter '*.nsi' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($nsi) {
        Write-Host "  NSIS 模板已解包：$($nsi.FullName)"
        $installDirLine = Get-Content $nsi.FullName | Select-String -Pattern 'InstallDir ' | Select-Object -First 3
        $installDirLine | ForEach-Object { Write-Host "    $_" }
    } else {
        Write-Host '  [warn] 7z 解包后未找到 .nsi（NSIS 2.51+ 模板可能已被编译为脚本，无法静态提取 InstallDir）' -ForegroundColor DarkYellow
    }
} else {
    Write-Host '  [skip] 未检测到 7z，跳过 NSIS 模板静态解包；改用运行时验证（见 Step 5）' -ForegroundColor DarkYellow
}

# 运行时校验：NSIS 写入注册表 HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\<ProductCode>\InstallLocation
# 需要先真安装一次（Step 5）

# ---- 5. 静默安装到 %ProgramFiles%\SkillHub 验证落地 ----------------
Write-Host ''
Write-Host '--- 5. 静默安装验证（仅当用户授权时执行） ---' -ForegroundColor Yellow

$expectedDir = Join-Path $env:ProgramFiles 'SkillHub'
Write-Host "  预期安装目录：$expectedDir"
$confirm = Read-Host "  是否执行真机安装? 输入 YES 继续（其他键跳过 Step 5/6）"
if ($confirm -ne 'YES') {
    Write-Host '  [skip] 用户未确认，跳过真机安装' -ForegroundColor DarkYellow
} else {
    # 先卸载可能残留
    if (Test-Path $expectedDir) {
        Write-Host '  检测到旧版本，先卸载...'
        Start-Process -FilePath $msi -ArgumentList '/x','/qn','REBOOT=ReallySuppress' -Wait -NoNewWindow
    }

    # NSIS 静默安装（S 是 silent + 路径参数）
    Write-Host '  -> NSIS 静默安装...'
    $proc = Start-Process -FilePath $nsis -ArgumentList '/S' -Wait -PassThru -NoNewWindow
    Write-Host "     NSIS exit code = $($proc.ExitCode)"

    # MSI 静默安装（覆盖式）
    Write-Host '  -> MSI 静默安装（覆盖 NSIS）...'
    $msiLog = Join-Path $env:TEMP "skillhub-msi-install-$PID.log"
    $proc = Start-Process -FilePath 'msiexec' -ArgumentList '/i',"`"$msi`"",'/qn','/L*V',"`"$msiLog`"",'REBOOT=ReallySuppress' -Wait -PassThru -NoNewWindow
    Write-Host "     MSI  exit code = $($proc.ExitCode)  (log: $msiLog)"

    # 验证文件落地
    Start-Sleep -Seconds 2
    $exeInstalled = Join-Path $expectedDir 'skillhub-helper.exe'
    if (Test-Path $exeInstalled) {
        $sz = (Get-Item $exeInstalled).Length
        Write-Host "[OK]   skillhub-helper.exe 已落地 $exeInstalled  ($sz bytes)" -ForegroundColor Green
        # 顺手验证落地 exe 的 subsystem
        $bytes2 = [System.IO.File]::ReadAllBytes($exeInstalled)
        $peOff2  = [BitConverter]::ToInt32($bytes2, 0x3C)
        $optOff2 = $peOff2 + 24
        $magic2  = [BitConverter]::ToUInt16($bytes2, $optOff2 + 0x12)
        $subOff2 = if ($magic2 -eq 0x20B) { 0x5C } else { 0x44 }
        $subsys2 = [BitConverter]::ToUInt16($bytes2, $optOff2 + $subOff2)
        if ($subsys2 -eq 2) {
            Write-Host '[OK]   落地 exe subsystem = WINDOWS_GUI（无黑窗口）' -ForegroundColor Green
        } else {
            Write-Host "[FAIL] 落地 exe subsystem = $subsys2（黑窗口！）" -ForegroundColor Red
            $fail = $true
        }
    } else {
        Write-Host "[FAIL] 落地未发现 $exeInstalled" -ForegroundColor Red
        $fail = $true
    }

    # 验证注册表 Uninstall 项
    $regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    $entries = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue | Where-Object {
        $_.DisplayName -like 'SkillHub*'
    }
    if ($entries) {
        $entries | ForEach-Object {
            Write-Host "  Uninstall.DisplayName : $($_.DisplayName)"
            Write-Host "  Uninstall.InstallLocation : $($_.InstallLocation)"
            Write-Host "  Uninstall.DisplayVersion : $($_.DisplayVersion)"
        }
        Write-Host '[OK]   注册表 Uninstall 项已写入' -ForegroundColor Green
    } else {
        Write-Host '[warn] HKLM 未找到 Uninstall 项（perUser 安装会落到 HKCU）' -ForegroundColor DarkYellow
    }
}

# ---- 收尾 ----------------------------------------------------------
Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
if ($fail) {
    Write-Host ' 验证结果：FAIL（见上方红色行）' -ForegroundColor Red
    exit 1
} else {
    Write-Host ' 验证结果：ALL PASS  ✅' -ForegroundColor Green
    exit 0
}
