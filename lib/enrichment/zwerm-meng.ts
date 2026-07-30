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
