$ErrorActionPreference = 'Stop'
$j = Get-Content -Raw 'D:\BigLionX\SkillHub\report-v2\report.json' | ConvertFrom-Json

function Get-Prop { param($obj, [string[]]$path) {
  $cur = $obj
  foreach ($p in $path) {
    if ($null -eq $cur) { return $null }
    if ($cur -is [System.Collections.IDictionary]) {
      if ($cur.Contains($p)) { $cur = $cur[$p] } else { return $null }
    } elseif ($cur.PSObject -and $cur.PSObject.Properties[$p]) {
      $cur = $cur.PSObject.Properties[$p].Value
    } else { return $null }
  }
  $cur
}}

# Stats
$expected    = [int]$j.stats.expected
$skipped     = [int]$j.stats.skipped
$unexpected  = [int]$j.stats.unexpected
$flaky       = [int]$j.stats.flaky
$ok          = $expected - $unexpected - $skipped

Write-Host "=== TOP-LEVEL ==="
Write-Host "version     : $($j.version)"
Write-Host "expected    : $expected"
Write-Host "skipped     : $skipped"
Write-Host "unexpected  : $unexpected"
Write-Host "flaky       : $flaky"
Write-Host "passed      : $ok"

# Time
$started = $j.startedTime
$ended   = Get-Prop $j @('finishedTime')
if (-not $ended) { $ended = Get-Prop $j @('lastModified') }
Write-Host "startedTime : $started"
Write-Host "finishedTime: $ended"
if ($started -and $ended) {
  $st=[DateTimeOffset]::Parse($started)
  $en=[DateTimeOffset]::Parse($ended)
  $span=$en-$st
  Write-Host ("duration    : {0} ({1:N1} min)" -f $span, $span.TotalMinutes)
}

# Config
Write-Host "`n=== CONFIG (subset) ==="
$bwList = Get-Prop $j @('config','metadata','browsers')
if ($bwList) { Write-Host ("browsers    : " + ($bwList -join ', ')) }
$projects = Get-Prop $j @('config','projects')
if ($projects) {
  foreach ($p in $projects) { Write-Host ("project     : name=$($p.name)") }
}
$wsCmd = Get-Prop $j @('config','webServer','command')
$wsUrl = Get-Prop $j @('config','webServer','url')
$wsTo  = Get-Prop $j @('config','webServer','timeout')
$wsReuse = Get-Prop $j @('config','webServer','reuseExistingServer')
$wsCmdStr = if ($wsCmd -is [array]) { $wsCmd -join ' ' } else { $wsCmd }
Write-Host "webServer   : command=$wsCmdStr url=$wsUrl timeout=$wsTo reuseExisting=$wsReuse"

Write-Host "`n=== FILES ==="
foreach ($f in $j.files) {
  $tests = $f.tests
  $cnt = $tests.Count
  Write-Host ("file: {0}  tests={1}" -f $f, $cnt)
  foreach ($t in $tests) {
    $statuses = ($t.results | ForEach-Object { $_.status }) -join ','
    $title = $t.title
    $loc = "$($t.location.file):$($t.location.line)"
    Write-Host ("  - [{0}] {1}  ({2})" -f $statuses, $title, $loc)
  }
}

# 总体失败列表
Write-Host "`n=== UNEXPECTED (failed) tests ==="
$anyFail = $false
foreach ($f in $j.files) {
  foreach ($t in $f.tests) {
    $hasFail = $false
    $failRes = $null
    foreach ($r in $t.results) { if ($r.status -eq 'failed' -or $r.status -eq 'timedOut') { $hasFail = $true; $failRes = $r; break } }
    if ($hasFail) {
      $anyFail = $true
      $loc = "$($t.location.file):$($t.location.line):$($t.location.column)"
      Write-Host ("-- FAIL: {0} ({1})" -f $t.title, $loc)
      Write-Host ("   duration(ms) = {0}" -f $failRes.duration)
      if ($failRes.errors) {
        foreach ($e in $failRes.errors) {
          Write-Host ("   ERR.message  :")
          $msg = $e.message
          # 截断到 1500 字符
          if ($msg.Length -gt 1500) { $msg = $msg.Substring(0,1500) + "...[truncated]" }
          Write-Host ("   | $msg")
          Write-Host ("   --- ")
          if ($e.stack) {
            $stk = $e.stack
            if ($stk.Length -gt 800) { $stk = $stk.Substring(0,800) + "...[truncated]" }
            Write-Host ("   stack(head)  : $stk")
          }
        }
      }
      # callLog 在 stdout/snippet 里检索
      if ($failRes.stdout) {
        Write-Host ("   stdout(head) :")
        $o = $failRes.stdout
        if ($o.Length -gt 600) { $o = $o.Substring(0,600) + "...[truncated]" }
        Write-Host ("   | $o")
      }
    }
  }
}
if (-not $anyFail) { Write-Host "(none)" }
