# Matchstation — runbook (print dit, leg het óp de EliteDesk)

## Wat draait hier

Deze pc is het **matchstation** van Lumen Logic. Elke 30 seconden vraagt
`C:\matchstation\watcher.ps1` (Taakplanner-taak **"Lumen Logic Matchstation"**, start
bij opstarten/inloggen) aan de app of er een offerteaanvraag klaarstaat. Zo ja: hij
downloadt het dossier naar `C:\matchstation\inbox\`, laat **Claude Code** de aanvraag
matchen tegen de productdatabase (alleen-lezen), en stuurt het estimate terug naar
Lumen Logic. Gelukt → map naar `done\` (na 30 dagen automatisch weg). Twee keer
mislukt → map naar `failed\` en het dossier staat in de app op "handmatig bekijken".

Logs: `C:\matchstation\logs\watcher-<datum>.log` (14 dagen bewaard).
Geheimen: `C:\matchstation\.env` — nooit kopiëren, mailen of in git zetten.

## Gaat er iets mis, dan merk je dat zó

De app bewaakt zichzelf: geen levensteken van deze pc >5 min, of een aanvraag >15 min
zonder resultaat → automatische melding (cron-job.org checkt elke 5 min). Krijg je die
melding, kom dan naar deze pc en loop de stappen hieronder af.

## Herstarten

1. Sneltest: staat er een PowerShell-venster/taak? Taakplanner openen → taak
   **Lumen Logic Matchstation** → rechtsklik → **Uitvoeren**.
2. Werkt dat niet: pc herstarten. Na de automatische login start de watcher vanzelf.
3. Kijk daarna in `C:\matchstation\logs\` of er nieuwe regels bijkomen
   ("Matchstation-watcher gestart").

## Claude opnieuw inloggen (bekendste storing: verlopen login)

Staat er in het log iets over authenticatie/login, of blijven sessies mislukken:

1. Open **PowerShell** en typ: `claude` (gewoon interactief).
2. Typ `/login` en volg de browserstappen — inloggen met het **Brink-account**.
3. Sluit Claude (`/exit`) en start de taak opnieuw (zie Herstarten).

## Een dossier in `failed\`

De aanvraag staat in Lumen Logic op "handmatig bekijken" — niets is kwijt. Bekijk
`failed\<dossier>\sessie-uitvoer.txt` om te zien waarom het misging. Daarna mag de
map weg. Opnieuw laten proberen: in Lumen Logic het dossier opnieuw in de
matchstation-wachtrij zetten (projectpagina → Matchstation-kaart).

## Wie bel je

1. **Timo Wittkamp** — beheer Lumen Logic en deze machine.
2. Komt Timo er niet uit: de aanvraag kan altijd handmatig in Lumen Logic worden
   afgehandeld; het station is een hulpmiddel, geen voorwaarde.

## Installatie / herinstallatie (voor de beheerder)

1. Zorg voor: Claude Code (ingelogd), Git, PostgreSQL-client (`psql` in PATH).
2. Kopieer uit de repo `scripts/matchstation/`: `watcher.ps1`, `sessieprompt.md`,
   `install-taakplanner.ps1` naar `C:\matchstation\`.
3. Maak `C:\matchstation\.env` met:
   `LUMENLOGIC_BASE_URL=…` · `MATCHSTATION_MACHINE_KEY=…` (zelfde waarde als in
   Vercel) · `DATABASE_URL_RO=…` (rol `matchstation_ro`, alleen SELECT).
4. `powershell -ExecutionPolicy Bypass -File C:\matchstation\install-taakplanner.ps1`
5. Test: `Start-ScheduledTask -TaskName "Lumen Logic Matchstation"` en volg het log.
