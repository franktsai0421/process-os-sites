param([string]$TaskName = 'ProcessControlWebsite')
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$backupRoot = if ($env:PROCESS_BACKUP_PATH) { $env:PROCESS_BACKUP_PATH } else { Join-Path $project '.local-backups' }
if ($backupRoot -match '^(\\\\|//|[a-zA-Z][a-zA-Z0-9+.-]*://)') { throw 'LOCAL_BACKUP_PATH_REQUIRED' }
$systemRoot = Join-Path $backupRoot '.system'
New-Item -ItemType Directory -Path $systemRoot -Force | Out-Null
$log = Join-Path $systemRoot 'service.log'
$command = "cd /d `"$project`" && `"$pnpm`" dev >> `"$log`" 2>&1"
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/d /c $command"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Process Control website and weekly backup service' -Force | Out-Null
  Write-Host "Scheduled task created: $TaskName"
  Write-Host 'The website and backup scheduler will start with Windows.'
} catch {
  $startup = [Environment]::GetFolderPath('Startup')
  $shortcutPath = Join-Path $startup "$TaskName.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = 'cmd.exe'
  $shortcut.Arguments = "/d /c $command"
  $shortcut.WorkingDirectory = $project
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Process Control website and weekly backup service'
  $shortcut.Save()
  Write-Host "Startup shortcut created: $shortcutPath"
  Write-Host 'The website and backup scheduler will start after Windows sign-in.'
}
