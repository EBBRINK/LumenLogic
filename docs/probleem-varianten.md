# Probleem: twee uitvoeringen van één project passen niet in het model

> Genoteerd op 20 aug 2026, **bewust niet opgepakt**. Timo's besluit: eerst de import
> repareren (`docs/probleem-bestek-kopwoorden.md`, `docs/probleem-meerdere-tabbladen.md`),
> daarna pas beslissen welke vorm varianten krijgen. Dit document bestaat zodat de bevinding
> niet wegzakt — het is géén opdracht.

## Het probleem in één regel

Een bestekschrijver levert regelmatig twee uitvoeringen van dezelfde woning — zelfde plafonds,
ander merk — en Lumen Logic kan er maar één dragen.

## De aanleiding

Armaturenlijst woning Bos (27-6-2026), twee tabbladen met dezelfde ruimtes:

| | Tabblad 1 | Tabblad 2 |
|---|---|---|
| Spot | Delta Light Spy 39 Trimless | Wever & Ducré Deep Adjust Trimless 1.0 |
| Aantal | 53 | 49 |
| Dimming | Dali-dim | Loxone |
| Bruto materiaal | € 23.413 | € 14.954 |

De klantvraag is niet "wat kost het" maar "wat kost het in deze twee smaken". Dat is het
gesprek waar een offertetool over zou moeten gaan.

## Waar het vastloopt

Drie plekken, oplopend in zwaarte:

1. **Spec-regels.** `spec_lines` hangt met één `dossier_id` aan het dossier
   (`db/schema.ts:496-550`) en heeft geen variantsleutel. Eén regelset per project.
2. **Offerte.** `getQuote` pakt hard de oudste offerte met `.limit(1)`
   (`lib/repo/dossiers.ts:651-657`); `updateQuoteHeader` doet hetzelfde (`:685-690`). Eén
   offerte per project, structureel.
3. **Armaturenboek-versies zijn geen varianten.** `armaturenboek_versions`
   (`db/schema.ts:1178-1190`) is een oplopende snapshot-keten met `max(version) + 1`
   (`lib/repo/armaturenboek-versions.ts:110-122`). Dat is geschiedenis van hetzelfde ontwerp,
   geen alternatieven naast elkaar. Er is ook geen "terugzetten" of "activeren".

Let op de naamsverwarring: `reviewKind === "variant"` en `lib/repo/variants.ts` gaan over
**kleurvarianten van één product**, niet over projectvarianten. Wie hieraan begint moet een
andere term kiezen (scenario? uitvoering? optie?) om de bestaande betekenis niet te vertroebelen.

## De twee kandidaat-vormen

Op 20 aug 2026 aan Timo voorgelegd, bewust nog niet gekozen:

- **Twee dossiers met een vergelijk-link.** Elk project houdt één regelset en één offerte; er
  komt alleen een koppeling en een vergelijkscherm bij. Datamodel blijft vrijwel ongemoeid.
  Nadeel: kopblok, klant en fase bestaan dubbel en kunnen uit elkaar lopen.
- **Variant-veld op `spec_lines` en `quotes`.** Eén dossier draagt meerdere uitvoeringen,
  offerte per variant. Dit is de echte oplossing en raakt migraties, `getQuote`, de estimate en
  de dossier-UI tegelijk — dus `/to-tickets`-werk, geen enkele bouwsessie.

## Wat er vandaag wel kan

Twee losse dossiers aanmaken, handmatig, zonder koppeling of vergelijking. Na
`docs/probleem-meerdere-tabbladen.md` kan de gebruiker in elk dossier het juiste tabblad kiezen,
wat dat pad in elk geval werkbaar maakt.

## Wanneer dit terug op tafel komt

Zodra de import staat. Beslis dan eerst de vorm, niet de code — en verwacht dat het antwoord
afhangt van hoe vaak dit in de praktijk voorkomt. Eén bestek met twee tabbladen is een
observatie, geen patroon; vraag Brink Licht hoe vaak ze dit zien voordat het datamodel opengaat.
