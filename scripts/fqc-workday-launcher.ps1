param([switch]$CheckOnly, [switch]$NoWindows)
# Resolve the installed checkout; a shortcut must target this launcher directly.
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskEntry = Join-Path $taskRoot 'scripts/start-fqc-workday.ps1'
if (!(Test-Path -LiteralPath $taskEntry)) { throw 'FQC startup script is missing.' }
& $taskEntry -CheckOnly:$CheckOnly -NoWindows:$NoWindows
