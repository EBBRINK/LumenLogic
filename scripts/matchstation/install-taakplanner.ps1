# install-taakplanner.ps1 — registreert de matchstation-watcher in de Windows
# Taakplanner (sprint M2). Eénmalig draaien op de EliteDesk, als de ingelogde
# gebruiker (de machine heeft autologin; Claude Code's login is per gebruiker, dus de
# taak moet IN die gebruikerssessie draaien — niet als SYSTEM).
#
# Draaien: powershell -ExecutionPolicy Bypass -File C:\matchstation\install-taakplanner.ps1

param([string]$Root = "C:\matchstation")

$ErrorActionPreference = "Stop"
$TaskName = "Lumen Logic Matchstation"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Root\watcher.ps1`"" `
  -WorkingDirectory $Root

# "Bij opstarten" (besluit Timo #1); AtLogOn omdat de watcher in de gebruikerssessie
# moet draaien en de machine automatisch inlogt — dat ís feitelijk "bij opstarten".
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew

# Interactief token, geen wachtwoordopslag: de taak start alleen als de gebruiker is
# ingelogd (autologin regelt dat).
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal | Out-Null

Write-Host "Taak '$TaskName' geregistreerd (start bij inloggen; autologin = bij opstarten)."
Write-Host "Nu direct starten: Start-ScheduledTask -TaskName '$TaskName'"
