param([switch]$CheckOnly, [switch]$NoWindows)
# User-authorized Windows sign-in startup. Reuse prepared storage; never initialize/seed.
$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$taskBase = Join-Path $taskRepo '.wrangler/local-only/routine-fqc-3040'
$taskRuntime = Join-Path $taskBase 'runtime'
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskC2c = Join-Path $env:USERPROFILE 'codex-with-chatgpt/bin/c2c.js'
$taskUrl = 'http://127.0.0.1:3040/process/?system=quality&view=quality-inspections&walkthrough=manual'
$taskThread = 'codex://threads/01a11470-77ad-76f3-98e9-32faedaef621'
$taskLogDir = Join-Path $taskBase 'workday'

function Test-FqcReady {
    try {
        $taskResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:3040/process/' -UseBasicParsing -TimeoutSec 4
        return $taskResponse.StatusCode -eq 200 -and $taskResponse.Content.Contains('routine-fqc.js')
    } catch { return $false }
}

$taskIsolation = Get-Content -LiteralPath (Join-Path $taskBase 'isolation.json') -Raw | ConvertFrom-Json
if (!$taskIsolation.storageIsolated -or $taskIsolation.port -ne 3040 -or
    [IO.Path]::GetFullPath($taskIsolation.sourceRoot) -ne $taskRepo -or
    [IO.Path]::GetFullPath($taskIsolation.runtimeRoot) -ne $taskRuntime -or
    ![IO.Path]::GetFullPath($taskIsolation.runtimeDb).StartsWith($taskRuntime + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw '3040 isolation mismatch; refusing startup.'
}
foreach ($taskFile in @($taskNode,$taskC2c,$taskIsolation.runtimeDb,
    (Join-Path $taskRuntime '.wrangler/local-only/session.json'),
    (Join-Path $taskRuntime '.wrangler/local-only/wrangler.json'),
    (Join-Path $taskRuntime 'scripts/local-server.mjs'),
    (Join-Path $taskRuntime 'scripts/local-network-preload.mjs'))) {
    if (!(Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw 'Prepared runtime file missing; no initialization performed.' }
}
if ($CheckOnly) {
    [PSCustomObject]@{ isolation='PASS';runtime=$taskRuntime;port=3040;ready=(Test-FqcReady);codex=$taskThread;initialize=$false } | ConvertTo-Json
    exit 0
}

$taskMutex = New-Object Threading.Mutex($false, 'Local\ProcessFqc3040Workday')
$taskAcquired = $taskMutex.WaitOne(0)
if (!$taskAcquired) { $taskMutex.Dispose(); exit 0 }
try {
    New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
    $taskStatus = [ordered]@{ requestedAt=(Get-Date).ToString('o');bootAt=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToString('o');url=$taskUrl;ready=$false;startedServer=$false;codexOpened=$false;localPageOpened=$false;connectionChecked=$false }
    if (!$NoWindows) {
        # Installed package declares the codex protocol; UI opening is explicitly requested.
        Start-Process -FilePath $taskThread
        $taskStatus.codexOpened = $true
    }
    $taskListeners = @(Get-NetTCPConnection -LocalPort 3040 -State Listen -ErrorAction SilentlyContinue)
    if ($taskListeners.Count -gt 0) {
        $taskOwners = @($taskListeners | Select-Object -ExpandProperty OwningProcess -Unique)
        foreach ($taskOwner in $taskOwners) {
            $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskOwner"
            if ($taskProcess.Name -ne 'node.exe' -or $taskProcess.CommandLine -notmatch 'local-server\.mjs.*--port 3040') {
                throw '3040 belongs to another process; no stop or alternate port attempted.'
            }
        }
        if (!(Test-FqcReady)) { throw 'Existing 3040 server not ready; preserved for review.' }
    } else {
        $taskServer = Start-Process -FilePath $taskNode -ArgumentList @('--import','./scripts/local-network-preload.mjs','./scripts/local-server.mjs','--port','3040') -WorkingDirectory $taskRuntime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogDir 'server.stdout.log') -RedirectStandardError (Join-Path $taskLogDir 'server.stderr.log')
        $taskStatus.startedServer = $true
        $taskStatus.serverPid = $taskServer.Id
        for ($taskAttempt=0; $taskAttempt -lt 90; $taskAttempt++) {
            if (Test-FqcReady) { break }
            $taskServer.Refresh()
            if ($taskServer.HasExited) { throw '3040 startup failed; existing data left intact.' }
            Start-Sleep -Seconds 2
        }
        if (!(Test-FqcReady)) { throw '3040 readiness timed out; no alternate port attempted.' }
    }
    $taskStatus.ready = $true
    if (!$NoWindows) {
        # Only the local reference page goes to the default browser. ChatGPT stays in Codex IAB.
        Start-Process -FilePath $taskUrl
        $taskStatus.localPageOpened = $true
    }
    $taskDoctor = Start-Process -FilePath $taskNode -ArgumentList @(('"' + $taskC2c + '"'),'doctor','-w',('"' + $taskRepo + '"'),'--json') -WorkingDirectory $taskRepo -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogDir 'doctor.stdout.json') -RedirectStandardError (Join-Path $taskLogDir 'doctor.stderr.log')
    if ($taskDoctor.WaitForExit(45000)) {
        $taskStatus.connectionChecked = $taskDoctor.ExitCode -eq 0
        if ($taskStatus.connectionChecked) {
            $taskHealth = Get-Content -LiteralPath (Join-Path $taskLogDir 'doctor.stdout.json') -Raw | ConvertFrom-Json
            $taskPendingRepair = Join-Path $taskLogDir 'connection-repair-pending.json'
            $taskNativeRepair = [bool]$taskHealth.chatgptRepair.needed -or [bool]$taskHealth.namedRepair.needed
            if ($taskNativeRepair -and !(Test-Path -LiteralPath $taskPendingRepair)) {
                @{status='requires-browser-verification';at=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $taskPendingRepair -Encoding UTF8
            }
            # A later doctor may report local health before the ChatGPT page is actually repaired.
            # Clear this marker only after the original chat verifies workspace_info successfully.
            $taskStatus.connectionRepairNeeded = $taskNativeRepair -or (Test-Path -LiteralPath $taskPendingRepair)
            $taskStatus.localConnectionReady = [bool]$taskHealth.report.bridge.ok -and [bool]$taskHealth.report.mcp.ok -and [bool]$taskHealth.report.tunnel.ok
            $taskStatus.connectionReady = $taskStatus.localConnectionReady -and !$taskStatus.connectionRepairNeeded
        }
    } else { $taskStatus.connectionCheckPending = $true }
    $taskStatus.completedAt = (Get-Date).ToString('o')
    $taskStatus | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLogDir 'startup.json') -Encoding UTF8
    [PSCustomObject]$taskStatus | ConvertTo-Json
} catch {
    # Constant error information only; detailed native failures can contain private environment data.
    @{at=(Get-Date).ToString('o');status='needs-review';dataReset=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLogDir 'startup-error.json') -Encoding UTF8
    Write-Error 'Workday startup could not complete; existing data and other services were preserved.'
    exit 1
} finally {
    if ($taskAcquired) { $taskMutex.ReleaseMutex() }
    $taskMutex.Dispose()
}
