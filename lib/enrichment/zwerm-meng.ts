// Waar de vallen en tegenproef-cellen tussen de echte cellen terechtkomen.
//
// ── De POSITIE mag de val niet verraden (30 jul, derde slot op deze deur) ────
// Eerst stond hier een vaste stap: één invoeging per n echte cellen. Bij Kreon werd dat "exact
// elke twintigste celId — c0020, c0040, c0060 …", en de agent meldde het zelf. Dezelfde klasse
// als het `v`/`t`-voorvoegsel en de vaste `+7`-vervalsing die we er eerder uit haalden: wie het
// patroon doorheeft leest alleen die negen cellen en wuift de rest door, en `val-recall 9/9`
// leest dan als zorgvuldigheid terwijl het patroonherkenning is.
//
// Nu: één invoeging per emmer van gelijke grootte, maar de plek BINNEN de emmer komt uit een
// hash van de INHOUD van de echte cellen. Dat houdt de twee eigenschappen die we nodig hebben —
// dezelfde invoer geeft dezelfde scherf (reproduceerbaar), en de invoegingen blijven over de
// hele scherf gespreid (val-recall blijft een uitspraak over élke scherf) — maar de afstanden
// ertussen zijn onregelmatig en verschillen per scherf en per run.
//
// Eigen bestand omdat de exporteur `node:crypto` en `node:fs` importeert en de testsuite in de
// browser draait. De hashfunctie komt van buiten; deze module blijft puur.

export type MengCel = { veld: string; waarde: string };

/** Leest 4 bytes vanaf `bij` als big-endian getal; werkt op Buffer én Uint8Array. */
function lees32(b: Uint8Array, bij: number): number {
  const i = b.length < 4 ? 0 : bij % (b.length - 3);
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}

export function meng<T extends MengCel>(
  echte: T[],
  extra: T[],
  hash: (s: string) => Uint8Array,
): T[] {
  if (extra.length === 0 || echte.length === 0) return [...echte, ...extra];
  const zaad = hash(echte.map((c) => `${c.veld}|${c.waarde}`).join("|"));
  const emmer = echte.length / extra.length;
  const naIndex = new Map<number, T[]>(); // echte-index → cellen die er ACHTER komen
  extra.forEach((c, i) => {
    const lo = Math.min(echte.length - 1, Math.floor(i * emmer));
    const hi = Math.max(lo, Math.min(echte.length - 1, Math.floor((i + 1) * emmer) - 1));
    const pos = lo + (lees32(zaad, i * 4) % (hi - lo + 1));
    const rij = naIndex.get(pos);
    if (rij) rij.push(c);
    else naIndex.set(pos, [c]);
  });
  const uit: T[] = [];
  echte.forEach((c, i) => {
    uit.push(c);
    for (const e of naIndex.get(i) ?? []) uit.push(e);
  });
  return uit;
}

// ── De val mag zijn TWEELING niet naast zich hebben (30 jul, vierde slot) ────
// Een val is een gekopieerde ECHTE cel met een vervalst getal. Bij Lombardo lag in 186 van de 196
// gevallen het origineel in dezelfde scherf, en vijf agents schreven onafhankelijk op wat dat
// oplevert: *"elke nee-cel is een duplicaat van een naastgelegen goede cel — zelfde naamvorm,
// dezelfde productnamen, alleen het getal is fout"*, *"gif-cellen"*, *"opzettelijk geplante
// afwijkers"*. Dan hoeft niemand de cel meer te lézen: twee cellen die op één na identiek zijn,
// dáár zit de val, en de rest kan door.
//
// Deze functie verhuist zulke vallen naar een andere scherf door ze te ruilen met een echte cel.
// Ruilen (in plaats van verplaatsen) houdt de scherfgrootte gelijk; de tegenpartij is altijd een
// ECHTE cel, dus geen enkele val of tegenproef verandert van buur door andermans reparatie.
// Bij gelijke geschiktheid wint de scherf met de MINSTE vallen, zodat val-recall een uitspraak
// blijft over élke scherf en niet alleen over de scherven die er toevallig veel kregen.
//
// ⚠ De PLEK binnen de doelscherf is even belangrijk als de scherf zelf. De eerste versie koos de
// laagste vrije index, en toen stonden bij XAL alle vijf de vallen van scherf 1 op positie 1–5 en
// alle zes van scherf 2 op 0–5. De agent zag ze onmiddellijk: *"de vijf afkeuringen zitten
// allemaal direct na c0001, aan het begin van de scherf"*. Dat is dezelfde fout als de vaste stap
// die `meng()` juist opgelost had — de reparatie van het ene lek maakte het andere terug. De
// ruilpartner wordt daarom uit de kandidaten van de doelscherf getrokken met de hash, niet met
// `Math.min`.
export function scheidTweelingen<T>(
  alles: T[],
  scherfMaat: number,
  soortVan: (c: T) => "echt" | "val" | "tegenproef",
  bronVan: (c: T) => T | null | undefined,
  zaad?: Uint8Array,
): { rij: T[]; geruild: number; rest: number } {
  const rij = [...alles];
  const scherf = (i: number) => Math.floor(i / scherfMaat);
  const posVan = new Map<T, number>();
  rij.forEach((c, i) => posVan.set(c, i));

  const vallenPerScherf = new Map<number, number>();
  rij.forEach((c, i) => {
    if (soortVan(c) === "val") vallenPerScherf.set(scherf(i), (vallenPerScherf.get(scherf(i)) ?? 0) + 1);
  });

  // Een broncel is nooit de ruilpartner. Anders lost de ene ruil de andere op: verhuis je een
  // echte cel naar de scherf van een al gerepareerde val en blijkt die cel diens bron, dan staat
  // de tweeling er weer naast — precies wat er bij XAL gebeurde (1 van de 11 bleef achter, en de
  // reparatie zag er in de telling uit als geslaagd).
  const bronnen = new Set<T>();
  for (const c of rij) {
    if (soortVan(c) !== "val") continue;
    const b = bronVan(c);
    if (b) bronnen.add(b);
  }

  let geruild = 0;
  let rest = 0;
  for (const val of rij.filter((c) => soortVan(c) === "val")) {
    const bron = bronVan(val);
    if (!bron) continue;
    const pv = posVan.get(val)!;
    const pb = posVan.get(bron);
    if (pb == null || scherf(pv) !== scherf(pb)) continue;

    // Kandidaten: echte cellen (geen broncel) buiten de scherf van de bron én van de val zelf,
    // gegroepeerd per scherf.
    const perScherf = new Map<number, number[]>();
    for (let i = 0; i < rij.length; i++) {
      if (soortVan(rij[i]) !== "echt" || bronnen.has(rij[i])) continue;
      const s = scherf(i);
      if (s === scherf(pb) || s === scherf(pv)) continue;
      const rij_ = perScherf.get(s);
      if (rij_) rij_.push(i);
      else perScherf.set(s, [i]);
    }
    if (perScherf.size === 0) {
      rest++; // geen enkele andere scherf beschikbaar (te weinig scherven) — eerlijk melden
      continue;
    }
    // Doelscherf: die met de minste vallen (bij gelijkspel de laagste scherf).
    let doel = -1;
    for (const s of [...perScherf.keys()].sort((a, b) => a - b)) {
      if (doel < 0 || (vallenPerScherf.get(s) ?? 0) < (vallenPerScherf.get(doel) ?? 0)) doel = s;
    }
    // Plek BINNEN die scherf: uit de hash, niet de laagste index — anders klonteren de verhuisde
    // vallen aan het begin van de scherf en is de recall weer een patroontoets.
    const kandidaten = perScherf.get(doel)!;
    const trek = zaad ? lees32(zaad, pv * 4) : pv * 2654435761;
    const beste = kandidaten[Math.abs(trek) % kandidaten.length];

    const oudeScherf = scherf(pv);
    const nieuweScherf = scherf(beste);
    [rij[pv], rij[beste]] = [rij[beste], rij[pv]];
    posVan.set(val, beste);
    posVan.set(rij[pv], pv);
    vallenPerScherf.set(oudeScherf, (vallenPerScherf.get(oudeScherf) ?? 1) - 1);
    vallenPerScherf.set(nieuweScherf, (vallenPerScherf.get(nieuweScherf) ?? 0) + 1);
    geruild++;
  }
  return { rij, geruild, rest };
}

// ── Zelfcontrole op de scherven vóór er een agent leest ─────────────────────
// Elk van de vier sloten op de valdeur is pas gaan opvallen aan de UITKOMST, nooit aan de code:
// het `v`-voorvoegsel, de vaste stap van 19, de tweeling ernaast, en de klontering vooraan die de
// tweeling-reparatie zélf veroorzaakte. Steeds meldde een agent het, en steeds was de ronde toen
// al gedraaid. Deze functie stelt dezelfde vragen aan de scherven zoals ze op schijf komen.
export function controleerVallen<T>(
  scherven: T[][],
  isVal: (c: T, scherfIndex: number, positie: number) => boolean,
  sleutelVan: (c: T) => string,
): string[] {
  const klachten: string[] = [];
  scherven.forEach((cellen, i) => {
    const posities = cellen.flatMap((c, j) => (isVal(c, i, j) ? [j] : []));
    if (posities.length === 0) {
      klachten.push(`scherf ${i + 1}: geen enkele val — val-recall zegt niets over deze scherf`);
      return;
    }
    if (posities.length > 2) {
      const afstanden = posities.slice(1).map((x, k) => x - posities[k]);
      if (new Set(afstanden).size === 1) {
        klachten.push(`scherf ${i + 1}: de vallen staan op een VASTE STAP van ${afstanden[0]}`);
      }
      const spanwijdte = posities[posities.length - 1] - posities[0];
      if (spanwijdte < cellen.length / 4) {
        klachten.push(
          `scherf ${i + 1}: de vallen klonteren (positie ${posities[0]}–${posities[posities.length - 1]} van ${cellen.length})`,
        );
      }
    }
    const telling = new Map<string, number>();
    for (const c of cellen) telling.set(sleutelVan(c), (telling.get(sleutelVan(c)) ?? 0) + 1);
    const tweelingen = cellen.filter((c, j) => isVal(c, i, j) && (telling.get(sleutelVan(c)) ?? 0) > 1).length;
    if (tweelingen > 0) {
      klachten.push(`scherf ${i + 1}: ${tweelingen} val(len) staan naast een cel met dezelfde naam en vorm`);
    }
  });
  return klachten;
}
