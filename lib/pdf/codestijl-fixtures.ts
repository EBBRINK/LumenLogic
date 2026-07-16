// Geanonimiseerde tekstfixtures in de vier échte armatuurcode-huisstijlen
// (stap 0 van docs/goal-import-ai-leesroute.md). Géén echte klantdata: project-,
// ruimte- en typenamen zijn verzonnen; merken zijn verzonnen of generieke
// catalogusmerken (XAL/Muuto). De strings zijn paginatekst zoals unpdf die levert
// en worden in stap 3 hergebruikt als input voor de AI-leesroute-tests.
//
// Bijbehorende invariant-tests: lib/pdf/codestijl-fixtures.test.ts.

// Huisstijl 1 — "deerns": nette inhoudsopgave-stroom (code · merk · type · blz),
// codes als Lp301/Ls004/Lw201-a die de huidige CODE-regex WÉL matcht. Dit is de
// bewezen stijl en blijft het deterministische snelpad. Bevat bewust: een record
// dat met een bekend merk begint (XAL), een dubbel record (dedup-gedrag) en
// trailing bladzijdenummers.
export const DEERNS_FIXTURE = `Nieuwbouw Kantoor De Vlinder — Verlichtingsplan
Inhoudsopgave armaturen

Armatuurcode Merk Type Blz
Lp301 XAL ORBIS 90 rond inbouw 8
Lp302 XAL ORBIS 90 vierkant inbouw 9
Ls004 Muuto AMBIT pendel wit 10
Ls004 Muuto AMBIT pendel wit 10
Lt105 Fictolight VELA 600 opaal opbouw 11
Lw201-a Nordica WALLIS up-down wand 12
Lr220 Muuto GRID 1200 raster 14`;

// Huisstijl 2 — "kvk": codes als L004/L005/L010a (hoofdletter direct gevolgd door
// cijfers) verspreid in doorlopende ontwerptekst, geen nette code·merk·type-stroom.
// Demonstreert O2 (docs/probleem-import-leest-verkeerd.md): de CODE-regex kent
// alleen de deerns-stijl, dus dit hele boek levert 0 regels op.
export const KVK_FIXTURE = `Lichtontwerp herinrichting kantoorgebouw — toelichting op het armatuurgebruik

In de ontvangsthal komt boven de balie een ronde pendelreeks, in dit plan
aangeduid als L004. Dezelfde reeks keert in kleinere maat terug in de
koffiecorner (L005), daar gecombineerd met wandarmaturen langs de garderobe.

Voor de vergaderzones op de tweede verdieping geldt code L010a: een
lijnarmatuur met opaal afdekking, per zaal in lengte aangepast. De
verkeersruimten volgen verzonken downlights; waar de plafondhoogte dat niet
toelaat, schrijft het plan onder dezelfde code een opbouwvariant voor.

De codes staan verspreid in de plattegronden en zijn nergens in een aparte
staat samengevat; per ruimte verwijst het ontwerp naar bovenstaande nummers.`;

// Huisstijl 3 — "tno": brede tabel met een ruimtenaam-kolom VÓÓR de merkkolom
// (O1: het eerste woord na de code is een ruimtenaam, geen merk) én
// suffix-varianten als Lr001B/Lr001_N/Lp601a die de CODE-regex mist (O2): alleen
// de basiscode Lr001 wordt een regel, de variantrijen worden in dat record
// opgeslokt.
export const TNO_FIXTURE = `Lichtplan verdieping 3 — armaturentabel
Per rij: code, ruimte, merk, type, lichtkleur, aantal, blz.

Code Ruimte Merk Type Lichtkleur Aantal Blz
Lr001 Vergaderruimte Fenolux NOVA 300 rond 3000K 6 21
Lr001B Vergaderruimte Fenolux NOVA 300 rond zwart 3000K 2 21
Lr001C Woonkamer Fenolux NOVA 300 pendel 2700K 4 22
Lr001_N Vergaderruimte Fenolux NOVA 300 nood 1 22
Lp601a Woonkamer Novalum PLANA 600 vierkant 4000K 8 23
Lp601b Woonkamer Novalum PLANA 600 vierkant dim 4000K 2 23`;

// Huisstijl 4 — "dordrecht": korte lettercodes (Ad, C1, Tn1, B, J) in een tabel
// waar merk en type al zijn ingevuld. Demonstreert het extreme O2-geval: geen
// enkele code matcht de CODE-regex, dus parseTocText leest hier niets — terwijl
// alle informatie letterlijk op de pagina staat.
export const DORDRECHT_FIXTURE = `Armaturenstaat renovatie — bestaande situatie
Merk en type per code al ingevuld door de installateur.

Code Merk Type Montage Aantal
Ad Heldra ATLAS 900 opbouw plafond 12
C1 Muuto LINEAR PRO 1200 pendel 4
Tn1 Novalum TUNNEL 55 wandmontage 8
B Heldra BOLLARD 800 buitenterrein 6
J Fenolux JUNO mini inbouw 96`;
