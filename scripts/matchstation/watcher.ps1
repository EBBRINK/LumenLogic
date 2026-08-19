# watcher.ps1 — het matchstation op de EliteDesk (sprint M2,
# docs/plan-matchstation-eigen-machine.md).
#
# Wat dit doet, elke 30 seconden (besluit na review-Henk — niet elke seconde):
#   1. GET /api/matchstation/werk met de machine-sleutel → 204 = niets, 200 = een
#      geclaimd dossier (de claim app-zijde voorkomt dubbel werk).
#   2. Alles naar C:\matchstation\inbox\<dossier>\ (werk.json, document.md,
#      paginabeelden) en één headless Claude Code-sessie starten voor die aanvraag.
#   3. De sessie schrijft resultaat.json (alleen `regels`); de watcher zet er zelf
#      queue_id bij en POST naar /api/matchstation/resultaat → map naar done\.
#   4. Timeout per poging + één retry. Twee keer mislukt → map naar failed\, en via
#      de POST krijgt elke bestaande regel "onzeker" ("handmatig bekijken"), zodat
#      één vergiftigde PDF de rij niet stilzet.
#   5. Opruimen: done\ ouder dan 30 dagen weg; watcher-logs ouder dan 14 dagen weg.
#
# Vangrails:
#   - De sessie krijgt UITSLUITEND $env:DATABASE_URL_RO (rol matchstation_ro, alleen
#     SELECT op visible_products/brands — ijzeren regel 3). De machine-sleutel blijft
#     in dit script en gaat NOOIT de sessie in.
#   - Secrets staan in C:\matchstation\.env, nooit in git.
#
# Draaien: via Taakplanner ("bij opstarten", zie install-taakplanner.ps1) of met de
# hand: powershell -ExecutionPolicy Bypass -File C:\matchstation\watcher.ps1

param(
  [string]$Root = "C:\matchstation",
  [int]$PollSeconds = 30,
  [int]$SessionTimeoutMinutes = 10,
  [int]$MaxAttempts = 2
)

$ErrorActionPreference = "Stop"

# ── Mappen en .env ────────────────────────────────────────────────────────────

$InboxDir  = Join-Path $Root "inbox"
$DoneDir   = Join-Path $Root "done"
$FailedDir = Join-Path $Root "failed"
$LogDir    = Join-Path $Root "logs"
foreach ($d in @($InboxDir, $DoneDir, $FailedDir, $LogDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}

function Write-Log([string]$Message) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$stamp] $Message"
  $file = Join-Path $LogDir ("watcher-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
  Add-Content -Path $file -Value $line
  Write-Host $line
}

# .env inlezen (KEY=VALUE, # is commentaar). Verwacht: LUMENLOGIC_BASE_URL,
# MATCHSTATION_MACHINE_KEY, DATABASE_URL_RO.
$EnvFile = Join-Path $Root ".env"
if (-not (Test-Path $EnvFile)) { throw "Geen $EnvFile — zie RUNBOOK-A4.md, sectie Installatie." }
$Config = @{}
foreach ($line in Get-Content $EnvFile) {
  $t = $line.Trim()
  if ($t -eq "" -or $t.StartsWith("#")) { continue }
  $i = $t.IndexOf("=")
  if ($i -lt 1) { continue }
  $Config[$t.Substring(0, $i).Trim()] = $t.Substring($i + 1).Trim().Trim('"')
}
foreach ($k in @("LUMENLOGIC_BASE_URL", "MATCHSTATION_MACHINE_KEY", "DATABASE_URL_RO")) {
  if (-not $Config[$k]) { throw "$k ontbreekt in $EnvFile" }
}
$BaseUrl = $Config["LUMENLOGIC_BASE_URL"].TrimEnd("/")
$MachineKey = $Config["MATCHSTATION_MACHINE_KEY"]
$AuthHeaders = @{ "x-matchstation-key" = $MachineKey }

$PromptTemplate = Join-Path $Root "sessieprompt.md"
if (-not (Test-Path $PromptTemplate)) { throw "Geen $PromptTemplate — kopieer scripts/matchstation/sessieprompt.md uit de repo." }

# ── Werk ophalen ──────────────────────────────────────────────────────────────

function Get-Werk {
  # Elke geslaagde aanroep is app-zijde een heartbeat, óók bij 204. Valt de
  # netwerkverbinding of de sleutel weg, dan wordt de heartbeat oud en gaat de
  # dood-melding af — precies de bedoeling.
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/matchstation/werk" -Headers $AuthHeaders `
    -Method GET -UseBasicParsing -TimeoutSec 60
  if ($resp.StatusCode -eq 204 -or [string]::IsNullOrWhiteSpace($resp.Content)) { return $null }
  return $resp.Content | ConvertFrom-Json
}

function Save-Werk($werk) {
  $dossierDir = Join-Path $InboxDir $werk.job.dossierId
  if (Test-Path $dossierDir) { Remove-Item -Recurse -Force $dossierDir }  # verse start bij her-claim
  New-Item -ItemType Directory -Path $dossierDir | Out-Null

  $werk | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $dossierDir "werk.json") -Encoding UTF8

  if ($werk.document.markdown) {
    $werk.document.markdown | Set-Content -Path (Join-Path $dossierDir "document.md") -Encoding UTF8
  }

  $pages = @($werk.document.pageImages)
  if ($pages.Count -gt 0) {
    $pagesDir = Join-Path $dossierDir "pages"
    New-Item -ItemType Directory -Path $pagesDir | Out-Null
    foreach ($p in $pages) {
      $ext = if ($p.mime -match "png") { "png" } elseif ($p.mime -match "webp") { "webp" } else { "jpg" }
      $name = "pagina-{0:d3}-tegel-{1}.{2}" -f [int]$p.page, [int]$p.tile, $ext
      Invoke-WebRequest -Uri ($BaseUrl + $p.url) -Headers $AuthHeaders -UseBasicParsing `
        -TimeoutSec 120 -OutFile (Join-Path $pagesDir $name)
    }
  }
  return $dossierDir
}

# ── De sessie ─────────────────────────────────────────────────────────────────

function Invoke-Sessie([string]$DossierDir) {
  # Headless Claude Code. Prompt via stdin (cmd-redirect: geen quoting-gedoe met een
  # lange prompt als argument). Alleen de leestools + Write (voor resultaat.json) en
  # Bash beperkt tot psql — de sessie hoeft niets anders te kunnen.
  Copy-Item $PromptTemplate (Join-Path $DossierDir "prompt.md") -Force
  $uitvoer = Join-Path $DossierDir "sessie-uitvoer.txt"
  $env:DATABASE_URL_RO = $Config["DATABASE_URL_RO"]

  $claudeArgs = '/c claude -p --output-format text --allowed-tools "Bash(psql:*) Read Glob Grep Write" < prompt.md > sessie-uitvoer.txt 2>&1'
  $p = Start-Process -FilePath "cmd.exe" -ArgumentList $claudeArgs `
    -WorkingDirectory $DossierDir -PassThru -WindowStyle Hidden
  $timeoutMs = $SessionTimeoutMinutes * 60 * 1000
  if (-not $p.WaitForExit($timeoutMs)) {
    Write-Log "Sessie-timeout na $SessionTimeoutMinutes min — proces $($p.Id) wordt beëindigd."
    & taskkill /PID $p.Id /T /F 2>$null | Out-Null
    return $false
  }
  if ($p.ExitCode -ne 0) {
    Write-Log "Sessie eindigde met exitcode $($p.ExitCode) — zie $uitvoer"
    return $false
  }
  return (Test-Path (Join-Path $DossierDir "resultaat.json"))
}

# ── Resultaat terugsturen ─────────────────────────────────────────────────────

function Send-Resultaat([string]$QueueId, $Regels) {
  # queue_id zet de watcher er zelf bij — de sessie kent hem wel (werk.json) maar
  # dit voorkomt dat een tikfout in de sessie-uitvoer bij de verkeerde job landt.
  $body = @{ queue_id = $QueueId; regels = @($Regels) } | ConvertTo-Json -Depth 20
  $resp = Invoke-RestMethod -Uri "$BaseUrl/api/matchstation/resultaat" -Method Post `
    -Headers $AuthHeaders -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  return $resp
}

function Get-FallbackRegels($werk) {
  # Twee pogingen mislukt → elke bestaande regel "onzeker" (landt app-zijde als
  # open + reviewvlag = handmatig bekijken). Geen bestaande regels → één
  # fixture-regel die het dossier zichtbaar in de reviewwachtrij zet; stil open
  # laten staan mag niet (plan: "nooit stil open").
  $toelichting = "Matchstation: sessie is $MaxAttempts keer mislukt (timeout of fout) — handmatig bekijken. Map: failed\$($werk.job.dossierId)."
  $lines = @($werk.existingLines)
  if ($lines.Count -gt 0) {
    return $lines | ForEach-Object { @{ spec_line_id = $_.id; uitkomst = "onzeker"; toelichting = $toelichting } }
  }
  return @(@{ fixture_code = "STATION-FOUT"; product_text = "Automatische verwerking mislukt"; uitkomst = "onzeker"; toelichting = $toelichting })
}

function Move-Dossier([string]$Bron, [string]$DoelMap, [string]$DossierId) {
  # Een hermatch van hetzelfde dossier mag een oude done/failed-map niet laten
  # botsen: bestaande doelmap eerst weg (Move-Item -Force overschrijft geen mappen).
  $doel = Join-Path $DoelMap $DossierId
  if (Test-Path $doel) { Remove-Item -Recurse -Force $doel }
  Move-Item $Bron $doel
}

# ── Opruimen (1× per dag) ─────────────────────────────────────────────────────

$script:LastCleanup = [datetime]::MinValue
function Invoke-Opruimen {
  if (((Get-Date) - $script:LastCleanup).TotalHours -lt 24) { return }
  $script:LastCleanup = Get-Date
  Get-ChildItem $DoneDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    ForEach-Object { Write-Log "Opruimen: done\$($_.Name) (>30 dagen)"; Remove-Item -Recurse -Force $_.FullName }
  Get-ChildItem $LogDir -File -Filter "watcher-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    ForEach-Object { Remove-Item -Force $_.FullName }
}

# ── Hoofdlus ──────────────────────────────────────────────────────────────────

Write-Log "Matchstation-watcher gestart. Poll elke $PollSeconds s tegen $BaseUrl."

while ($true) {
  try {
    Invoke-Opruimen

    $werk = Get-Werk
    if ($null -ne $werk) {
      $dossierId = $werk.job.dossierId
      $queueId = $werk.job.queueId
      Write-Log "Werk: dossier $dossierId (job $queueId), $(@($werk.existingLines).Count) bestaande regels, document: $($werk.document.filename)"
      $dossierDir = Save-Werk $werk

      $gelukt = $false
      for ($poging = 1; $poging -le $MaxAttempts -and -not $gelukt; $poging++) {
        Write-Log "Sessie-poging $poging/$MaxAttempts voor $dossierId"
        $resultaatPad = Join-Path $dossierDir "resultaat.json"
        if (Test-Path $resultaatPad) { Remove-Item -Force $resultaatPad }
        if (-not (Invoke-Sessie $dossierDir)) { continue }
        try {
          $resultaat = Get-Content -Raw $resultaatPad | ConvertFrom-Json
          $regels = @($resultaat.regels)
          if ($regels.Count -lt 1) { throw "resultaat.json bevat geen regels" }
          $antwoord = Send-Resultaat $queueId $regels
          Write-Log "Resultaat verwerkt: $($antwoord.verwerkt) regels voor $dossierId"
          $gelukt = $true
        } catch {
          Write-Log "Poging $poging faalde bij verwerken/terugsturen: $($_.Exception.Message)"
        }
      }

      if ($gelukt) {
        Move-Dossier $dossierDir $DoneDir $dossierId
      } else {
        Write-Log "Dossier $dossierId $MaxAttempts keer mislukt — naar failed\ en 'handmatig bekijken' terugmelden."
        Move-Dossier $dossierDir $FailedDir $dossierId
        try {
          Send-Resultaat $queueId (Get-FallbackRegels $werk) | Out-Null
          Write-Log "Fallback ('onzeker') teruggemeld voor $dossierId."
        } catch {
          # Lukt óók de fallback-POST niet, dan verloopt de claim (15 min) en biedt
          # de app het dossier opnieuw aan; de dood-melding vangt een structureel gat.
          Write-Log "Fallback-POST faalde: $($_.Exception.Message) — claim verloopt vanzelf."
        }
      }
      continue  # direct opnieuw pollen: misschien staat er nog een dossier te wachten
    }
  } catch {
    Write-Log "Fout in hoofdlus: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $PollSeconds
}
