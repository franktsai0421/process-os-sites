param([switch]$VerifyRestart,[Parameter(Mandatory=$true)][string]$RuntimeRoot,[Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$MediaRoot)
$ErrorActionPreference='Stop'
$workspace=Split-Path -Parent $PSScriptRoot
$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$evidence=(Resolve-Path -LiteralPath $EvidenceRoot).Path
$listener=Get-NetTCPConnection -LocalPort 3020 -State Listen -ErrorAction SilentlyContinue
if($listener){
 $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
 if($taskProcess.CommandLine -notlike '*ipqc-isolated-server.cjs*' -or $taskProcess.CommandLine -notlike '*--port 3020*'){throw 'Unknown service on 3020; refusing restart'}
 if($taskProcess.CommandLine -like '*--web-feedback*' -and !$VerifyRestart){throw 'Feedback is already running; refusing duplicate restart'}
 foreach($name in @('primary','synthetic')){if(!(Test-Path -LiteralPath "$runtime/$name-latest.json")){throw 'Latest checkpoint missing'}}
 # The old server checkpoints before acknowledging mutations. Stop only this verified listener,
 # then read its latest durable checkpoints (never restore the earlier evidence snapshot).
 Stop-Process -Id $listener.OwningProcess
 Wait-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}
$restartRoot=Join-Path $evidence ('restart-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $restartRoot | Out-Null
foreach($name in @('primary','synthetic')){Copy-Item -LiteralPath "$runtime/$name-latest.json" -Destination "$restartRoot/$name-at-restart.json";if(Test-Path -LiteralPath "$runtime/$name-web-feedback.json"){Copy-Item -LiteralPath "$runtime/$name-web-feedback.json" -Destination "$restartRoot/$name-web-feedback.json"}}
$launchArgs=@('--max-old-space-size=6144','scripts/ipqc-isolated-server.cjs','--source',"`"$runtime/primary-latest.json`"",'--port','3020','--editor-fixture',"`"$runtime/synthetic-latest.json`"",'--media-root',"`"$MediaRoot`"",'--runtime-dir',"`"$runtime`"",'--web-feedback')
$started=Start-Process -FilePath (Get-Command node -ErrorAction Stop).Source -ArgumentList $launchArgs -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput "$restartRoot/server.log" -RedirectStandardError "$restartRoot/server-error.log" -PassThru
Write-Output "3020 PID: $($started.Id); latest checkpoints preserved; feedback enabled"
