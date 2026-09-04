# SkillHub Helper v2.0.5 PE Subsystem Verification
# Reads IMAGE_OPTIONAL_HEADER.Subsystem field (PE32+ offset 0x5C, PE32 offset 0x44).
# Value 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI -> no console allocation -> no black window.

$exe = 'd:\BigLionX\SkillHub\apps\helper\src-tauri\target\release\skillhub-helper.exe'
if (-not (Test-Path $exe)) { Write-Host '[FAIL] exe not found' -ForegroundColor Red; exit 1 }

$sz = (Get-Item $exe).Length
Write-Host ('[OK]   exe built ({0:N0} bytes)' -f $sz)

$bytes  = [System.IO.File]::ReadAllBytes($exe)
$peOff  = [BitConverter]::ToInt32($bytes, 0x3C)        # DOS.e_lfanew
$optOff = $peOff + 24                                    # PE sig(4) + COFF(20)
$magic  = [BitConverter]::ToUInt16($bytes, $optOff + 0x00)

# Subsystem is at offset 0x44 in BOTH PE32 and PE32+:
#   PE32+  ImageBase expanded from 4 -> 8 bytes (+4), but BaseOfData removed (-4). Net: 0.
# So Subsystem stays at optOff+0x44 regardless of magic.
$subOff = 0x44
$arch   = 'PE32 (x86)'
if ($magic -eq 0x20B) { $arch = 'PE32+ (x64)' }
elseif ($magic -eq 0x10B) { $arch = 'PE32 (x86)' }
else { Write-Host ('[FAIL] unknown magic 0x{0:X4}' -f $magic) -ForegroundColor Red; exit 1 }

$subsys  = [BitConverter]::ToUInt16($bytes, $optOff + $subOff)
$ep      = [BitConverter]::ToUInt32($bytes, $optOff + 0x10)
# ImageBase is 8 bytes (ULONGLONG) in PE32+, 4 bytes (DWORD) in PE32, at optOff+0x18.
$ibOff   = 0x18
$ibSize  = if ($magic -eq 0x20B) { 8 } else { 4 }
$ibBytes = $bytes[($optOff + $ibOff)..($optOff + $ibOff + $ibSize - 1)]
$imgBase = [BitConverter]::ToUInt64($ibBytes, 0)
$soiOff  = 0x38                              # same offset for both PE32 and PE32+
$soi     = [BitConverter]::ToUInt32($bytes, $optOff + $soiOff)

$name = switch ($subsys) {
    1 { 'NATIVE' }
    2 { 'WINDOWS_GUI  <-- correct, no black window' }
    3 { 'WINDOWS_CUI  <-- WRONG! would show black window' }
    9 { 'WINDOWS_CE_GUI' }
    default { 'UNKNOWN' }
}

Write-Host ''
Write-Host '--- IMAGE_OPTIONAL_HEADER ---'
Write-Host ('  e_lfanew                : 0x{0:X}' -f $peOff)
Write-Host ('  Magic                   : 0x{0:X4}  ({1})' -f $magic, $arch)
Write-Host ('  AddressOfEntryPoint     : 0x{0:X}' -f $ep)
Write-Host ('  ImageBase               : 0x{0:X8}' -f $imgBase)
Write-Host ('  SizeOfImage             : 0x{0:X}  ({1:N0} bytes virtual size)' -f $soi, $soi)
Write-Host ('  Subsystem (offset 0x{0:X}) : {1} (0x{1:X})' -f $subOff, $subsys)
Write-Host ('                              ' + $name)

Write-Host ''
if ($subsys -eq 2) {
    Write-Host '[OK] Black-window verification PASSED (Subsystem = WINDOWS_GUI)' -ForegroundColor Green
    exit 0
} else {
    Write-Host ('[FAIL] subsystem={0}, expected 2' -f $subsys) -ForegroundColor Red
    Write-Host '       Check apps/helper/src-tauri/src/main.rs:5 for #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]'
    exit 1
}
