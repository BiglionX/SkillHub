$ErrorActionPreference = 'Stop'

function Get-DotPath {
    param($obj, [string[]]$path)
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
}

function Truncate {
    param($s, [int]$n)
    if ($null -eq $s) { return '' }
    if ($s.Length -le $n) { return $s }
    return $s.Substring(0, $n) + '...[truncated]'
}

$j = Get-Content -Raw 'D:\BigLionX\SkillHub\report-v2\report.json' | ConvertFrom-Json

Write-Host '=== TOP-LEVEL ==='
Write-Host ('version    : {0}' -f $j.version)
Write-Host ('expected   : {0}' -f $j.stats.expected)
Write-Host ('skipped    : {0}' -f $j.stats.skipped)
Write-Host ('unexpected : {0}' -f $j.stats.unexpected)
Write-Host ('flaky      : {0}' -f $j.stats.flaky)
$ok = [int]$j.stats.expected - [int]$j.stats.unexpected - [int]$j.stats.skipped
Write-Host ('passed     : {0}' -f $ok)

$started = $j.startedTime
$ended = Get-DotPath $j @('finishedTime')
if (-not $ended) { $ended = Get-DotPath $j @('lastModified') }
Write-Host ('startedTime: {0}' -f $started)
Write-Host ('finishedTime: {0}' -f $ended)
if ($started -and $ended) {
    $st = [DateTimeOffset]::Parse($started)
    $en = [DateTimeOffset]::Parse($ended)
    $span = $en - $st
    Write-Host ('duration   : {0} ({1:N2} min)' -f $span, $span.TotalMinutes)
}

Write-Host ''
Write-Host '=== CONFIG ==='
$bwList = Get-DotPath $j @('config','metadata','browsers')
if ($bwList) { Write-Host ('browsers    : {0}' -f ($bwList -join ', ')) }
$projects = Get-DotPath $j @('config','projects')
if ($projects) {
    foreach ($p in $projects) { Write-Host ('project    : name={0} testDir={1}' -f $p.name, $p.testDir) }
}
$wsCmd = Get-DotPath $j @('config','webServer','command')
$wsUrl = Get-DotPath $j @('config','webServer','url')
$wsTo  = Get-DotPath $j @('config','webServer','timeout')
$wsReuse = Get-DotPath $j @('config','webServer','reuseExistingServer')
$wsTimeoutReq = Get-DotPath $j @('config','webServer','timeoutRequests')
$wsHealthCheck = Get-DotPath $j @('config','webServer','healthCheckFunction')
$wsCmdStr = if ($wsCmd -is [array]) { $wsCmd -join ' ' } else { $wsCmd }
Write-Host ('webServer  : command="{0}" url={1} timeout={2} reuse={3}' -f $wsCmdStr, $wsUrl, $wsTo, $wsReuse)
Write-Host ('webServer.healthCheckFunction = {0}' -f $wsHealthCheck)
Write-Host ('webServer.timeoutRequests      = {0}' -f $wsTimeoutReq)

Write-Host ''
Write-Host '=== FILES & TESTS ==='
$failedTests = New-Object System.Collections.Generic.List[object]
foreach ($f in $j.files) {
    $tests = $f.tests
    Write-Host ('FILE: {0}   tests={1}' -f $f, $tests.Count)
    foreach ($t in $tests) {
        $statuses = ($t.results | ForEach-Object { $_.status }) -join ','
        $loc = ('{0}:{1}:{2}' -f $t.location.file, $t.location.line, $t.location.column)
        Write-Host ('  - [{0}] ({1}) {2}' -f $statuses, $loc, $t.title)
        foreach ($r in $t.results) {
            if ($r.status -eq 'failed' -or $r.status -eq 'timedOut' -or $r.status -eq 'interrupted') {
                $failedTests.Add(@{ test = $t; result = $r; file = $f })
            }
        }
    }
}

Write-Host ''
Write-Host ('=== FAILED CASES DETAIL (count={0}) ===' -f $failedTests.Count)
foreach ($item in $failedTests) {
    $t = $item.test
    $r = $item.result
    Write-Host ''
    Write-Host ('-- FAIL: {0}' -f $t.title)
    Write-Host ('   location : {0}:{1}:{2}' -f $t.location.file, $t.location.line, $t.location.column)
    Write-Host ('   duration : {0} ms' -f $r.duration)
    Write-Host ('   retry    : {0}' -f $r.retry)
    Write-Host ('   status   : {0}' -f $r.status)
    $errors = $r.errors
    if ($errors) {
        $idx = 0
        foreach ($e in $errors) {
            $idx++
            Write-Host ('   --- error[{0}] ---' -f $idx)
            Write-Host ('   message:')
            Write-Host (Truncate $e.message 2000)
            if ($e.stack) {
                Write-Host ('   stack (head 1200):')
                Write-Host (Truncate $e.stack 1200)
            }
        }
    }
    if ($r.stdout) {
        Write-Host '   stdout (head 800):'
        Write-Host (Truncate $r.stdout 800)
    }
    if ($r.stderr) {
        Write-Host '   stderr (head 400):'
        Write-Host (Truncate $r.stderr 400)
    }
}
