# Probleem: 413 bij upload echt armaturenboek (2026-07-15)

> Retroactief uitgeschreven — de fix (commit `b098d23`) is gebouwd en gedeployed vóórdat dit
> schrijfstuk en de plan-/reviewronde er waren. Dat was tegen de werkwijze (probleem → plan
> met 2 agents → fix met 2 agents); de onafhankelijke review is alsnog uitgevoerd, zie onder.

## Wat er gebeurde

Timo uploadde een echt armaturenboek (`07364_NLD_BD_LIG_armaturenboek_ANN_20260313.pdf`,
5,5 MB, 31 pagina's) in een nieuw project op productie. De pagina crashte naar
"This page couldn't load". Vercel-logs: **HTTP 413 Payload Too Large** op de submit.

## Oorzaak

De server-action `importArmaturenboekPdfAction` ontving het volledige PDF-binair.
Next.js server-actions accepteren standaard max **1 MB** body; Vercel heeft daarboven een
harde platformgrens van ~**4,5 MB**. Het testboek (klein, met tekstlaag) bleef daar altijd
onder, dus het gat is in de bouwfase nooit geraakt. Echte boeken (fotorijk) zijn 5–50 MB.

## Gekozen oplossing (fix b098d23)

1. **Client-side tekstextractie**: de browser leest de PDF (unpdf, `lib/pdf/extract.ts`) en
   stuurt alléén de tekstlaag per pagina (JSON) naar een nieuwe action
   `importArmaturenboekPagesAction`. Bestandsgrootte is daarmee irrelevant; de server-parser
   werd een pure functie `parseSpecLinesFromPages`. Vangnet: bodySizeLimit expliciet op 4 MB,
   tekst-payload gecapt, pages gevalideerd.
2. **AI-vangnet niet-blokkerend**: `runVangnetSafe` draait via Next `after()` ná de response
   (buiten request-scope: fallback naar awaited, zodat tests identiek blijven).

## Bijvangst

Het bewuste boek heeft **géén tekstlaag** (0 tekens over 31 pagina's — beeld-export). De fix
maakt de foutafhandeling eerlijk en snel, maar dit boek levert pas regels op als er OCR is
(open punt; taak-chip aangemaakt voor fase 1-verkenning).

## Procesnotitie

Overtreding van de werkwijze vastgelegd in memory (`lumenlogic-fix-werkwijze`): voortaan óók
bij productie-bugs eerst dit soort schrijfstuk, dan plan-agent + reviewer, dan bouwer +
verifier. De retroactieve onafhankelijke review van `b098d23` staat hieronder aangevuld.
