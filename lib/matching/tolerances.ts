// Tolerantietabel als code (C-06) — bron: docs/matching-regelset.md, met Eduard
// vastgesteld. Wijziging = bewuste commit hier + in de regelset-doc, nooit een config-UI.
//
//   Spec               | Groen           | Geel        | Rood
//   -------------------|-----------------|-------------|---------------------------
//   Vermogen (W)       | ± 10%           | 10 – 40%    | > 40% of niet leverbaar
//   Lumen output       | ± 15%           | 15 – 40%    | > 40%
//   Beam angle         | ± 10°           | 10 – 25°    | > 25°
//   IP-klasse          | exact of hoger  | n.v.t.      | lager dan gevraagd = ALTIJD rood
//   Kleurtemperatuur   | exact           | n.v.t.      | anders
//   Lengte / afmeting  | exact           | < ± 5%      | > 5%
//   Vorm (vierk./rond) | exact           | n.v.t.      | geen vorm-conversie
//
// Invarianten (masterplan §3, elk getest): strengste afwijking telt (rood > geel >
// groen) · IP lager = altijd rood · kelvin exact · ontbrekend ≠ afwijkend (→ 'onbekend',
// nooit 'rood') · elke afwijking benoemd, ook binnen groen (C-07).

import type { MatchDeviation } from "@/db/schema";
import { acronymWord, capitalizeFirst, splitIdentifier } from "@/lib/acronyms";

export type FieldVerdict = "groen" | "geel" | "rood" | "onbekend";

// Percentage-afwijking t.o.v. gevraagd; symmetrisch.
function pctDeviation(requested: number, delivered: number): number {
  if (requested === 0) return delivered === 0 ? 0 : Infinity;
  return Math.abs(delivered - requested) / Math.abs(requested);
}

function pctVerdict(
  requested: number,
  delivered: number,
  groenPct: number,
  geelPct: number,
): FieldVerdict {
  const dev = pctDeviation(requested, delivered);
  if (dev <= groenPct) return "groen";
  if (dev <= geelPct) return "geel";
  return "rood";
}

export function judgeWatt(requested: number, delivered: number | null): FieldVerdict {
  if (delivered == null) return "onbekend"; // ontbrekend ≠ afwijkend
  return pctVerdict(requested, delivered, 0.10, 0.40);
}

export function judgeLumen(requested: number, delivered: number | null): FieldVerdict {
  if (delivered == null) return "onbekend";
  return pctVerdict(requested, delivered, 0.15, 0.40);
}

export function judgeBeamAngle(
  requested: number,
  delivered: number | null,
): FieldVerdict {
  if (delivered == null) return "onbekend";
  const dev = Math.abs(delivered - requested);
  if (dev <= 10) return "groen";
  if (dev <= 25) return "geel";
  return "rood";
}

// "IP20" / "ip 44" / "44" → 20 / 44 / 44; onherkenbaar → null.
export function parseIp(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /(\d{2})/.exec(value);
  return m ? parseInt(m[1], 10) : null;
}

// Lager IP dan gevraagd = ALTIJD rood, geen tolerantie. Hoger = groen (voldoet).
export function judgeIp(requested: string, delivered: string | null): FieldVerdict {
  const req = parseIp(requested);
  if (req == null) return "onbekend"; // gevraagde waarde onleesbaar → geen oordeel
  const got = parseIp(delivered);
  if (got == null) return "onbekend";
  return got >= req ? "groen" : "rood";
}

// Kleurtemperatuur: exact. Niet leverbaar in de juiste range → rood.
export function judgeKelvin(requested: number, delivered: number | null): FieldVerdict {
  if (delivered == null) return "onbekend";
  return delivered === requested ? "groen" : "rood";
}

// CRI: gevraagd is een minimum ("CRI≥90"). Gelijk of hoger = groen, lager = rood.
// (Aanname genoteerd in HANDOVER: de regelset noemt CRI niet expliciet in de tabel;
// een lagere kleurweergave-index dan gespecificeerd is nooit gelijkwaardig.)
export function judgeCri(requested: number, delivered: number | null): FieldVerdict {
  if (delivered == null) return "onbekend";
  return delivered >= requested ? "groen" : "rood";
}

// Lengte/afmeting: exact groen, < ±5% geel, > 5% rood.
export function judgeSize(requested: number, delivered: number | null): FieldVerdict {
  if (delivered == null) return "onbekend";
  const dev = pctDeviation(requested, delivered);
  if (dev === 0) return "groen";
  if (dev <= 0.05) return "geel";
  return "rood";
}

// Vorm: exact (genormaliseerd), geen vorm-conversie mogelijk.
const SHAPE_ALIASES: Record<string, string> = {
  rond: "rond", round: "rond", rd: "rond", circle: "rond",
  vierkant: "vierkant", square: "vierkant", sq: "vierkant",
  rechthoek: "rechthoek", rectangular: "rechthoek", rect: "rechthoek",
  lineair: "lineair", linear: "lineair", lijn: "lineair",
};
export function normalizeShape(v: string): string {
  const key = v.trim().toLowerCase();
  return SHAPE_ALIASES[key] ?? key;
}
export function judgeShape(requested: string, delivered: string | null): FieldVerdict {
  if (!delivered) return "onbekend";
  return normalizeShape(requested) === normalizeShape(delivered) ? "groen" : "rood";
}

// Dimbaarheid (DALI/1-10V/fase): genormaliseerd exact; afwijkend protocol = geel
// (zelfde lijn-DNA, andere driver — reviewbaar), onbekend = onbekend.
// (Aanname genoteerd in HANDOVER: niet in de tolerantietabel.)
export function judgeDimmable(requested: string, delivered: string | null): FieldVerdict {
  if (!delivered) return "onbekend";
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (norm(delivered).includes(norm(requested)) || norm(requested).includes(norm(delivered)))
    return "groen";
  return "geel";
}

// Kleur is een cosmetische variant (C-13/D-02), géén tolerantieveld: een andere kleur
// verandert de status niet, maar wordt wel benoemd en kan een variantkeuze-review geven.
export function judgeColor(requested: string, delivered: string | null): FieldVerdict {
  if (!delivered) return "onbekend";
  return delivered.trim().toLowerCase() === requested.trim().toLowerCase()
    ? "groen"
    : "groen"; // variant, geen afwijking — de note benoemt het verschil
}

// ── Gevraagde velden van een spec-regel → oordelen per kandidaat ─────────────

export type RequestedSpecs = {
  kelvin?: number | null;
  cri?: number | null;
  ip?: string | null;
  watt?: number | null;
  lumen?: number | null;
  beamAngle?: number | null;
  sizeCm?: number | null;
  shape?: string | null;
  color?: string | null;
  dimmable?: string | null;
};

export type DeliveredSpecs = {
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  watt: number | null;
  lumen: number | null;
  beamAngle: number | null;
  // grootste beschikbare maat van het product; per veld vergeleken indien aanwezig
  sizeCm: number | null;
  shape: string | null;
  color: string | null;
  dimmable: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  kelvin: "kelvin",
  cri: "CRI",
  ip: "IP",
  watt: "watt",
  lumen: "lumen",
  beamAngle: "beam angle",
  sizeCm: "size",
  shape: "shape",
  color: "color",
  dimmable: "dimmability",
};

// UX-audit 30 jul (bug #8): deze map bestond al, maar alleen om `note`-zinnen mee te
// bouwen — de schermen toonden de ruwe sleutel (`beamAngle`, `dimmable`). Nu geëxporteerd,
// mét fallback, zodat een nieuw veld nooit meer als camelCase-identifier kan lekken.
//
// REPARATIE 30 jul — de eerste versie leverde vier conventies in vier tabelrijen op
// (`kelvin` · `Straalhoek` · `IP` · `beam angle`, gemeten in de screenshot van de
// Field-kolom). Twee oorzaken, allebei hier weggenomen:
//
//  1. De mapwaarden zijn met opzet kléin: ze zitten midden in een zin ("no data for beam
//     angle"). De fallback zette juist een hoofdletter. Nu levert `fieldLabel()` ALTIJD de
//     midden-in-de-zin-vorm; wie een kolomkop of lijstitem rendert vraagt
//     `fieldLabelTitle()`. De hoofdletter zit dus op de rendersite, niet in de data.
//  2. Er was geen afkortingentabel terwijl de zusterfunctie `eventLabel()` die wél had:
//     "IP" werd "Ip", "CRI" werd "Cri", "UGR" werd "Ugr". Beide gebruiken nu lib/acronyms.ts.

/** Midden-in-de-zin-vorm: `beam angle`, `IP`, `dimmability`. */
export function fieldLabel(key: string): string {
  const known = FIELD_LABELS[key];
  if (known) return known;
  const words = splitIdentifier(key);
  if (words.length === 0) return key;
  return words.map(acronymWord).join(" ");
}

/** Begin-van-een-regel-vorm: `Beam angle`, `IP`, `Dimmability`. Voor kolommen en labels. */
export function fieldLabelTitle(key: string): string {
  return capitalizeFirst(fieldLabel(key));
}

// Élk gevuld gevraagd veld krijgt een oordeel + benoemde afwijking (C-07:
// transparantieregel — ook binnen groen wordt het verschil benoemd).
export function judgeCandidate(
  req: RequestedSpecs,
  got: DeliveredSpecs,
): MatchDeviation[] {
  const out: MatchDeviation[] = [];
  const push = (
    field: string,
    requested: string | number,
    delivered: string | number | null,
    verdict: FieldVerdict,
  ) => {
    const label = fieldLabel(field);
    let note: string | undefined;
    if (verdict === "onbekend") note = `no data for ${label}`;
    else if (String(requested) !== String(delivered))
      note = `requested ${requested}, delivered ${delivered}`;
    else note = "exact";
    out.push({ field, requested, delivered, verdict, note });
  };

  if (req.kelvin != null) push("kelvin", req.kelvin, got.kelvin, judgeKelvin(req.kelvin, got.kelvin));
  if (req.cri != null) push("cri", req.cri, got.cri, judgeCri(req.cri, got.cri));
  if (req.ip) push("ip", req.ip, got.ip, judgeIp(req.ip, got.ip));
  if (req.watt != null) push("watt", req.watt, got.watt, judgeWatt(req.watt, got.watt));
  if (req.lumen != null) push("lumen", req.lumen, got.lumen, judgeLumen(req.lumen, got.lumen));
  if (req.beamAngle != null)
    push("beamAngle", req.beamAngle, got.beamAngle, judgeBeamAngle(req.beamAngle, got.beamAngle));
  if (req.sizeCm != null) push("sizeCm", req.sizeCm, got.sizeCm, judgeSize(req.sizeCm, got.sizeCm));
  if (req.shape) push("shape", req.shape, got.shape, judgeShape(req.shape, got.shape));
  if (req.color) {
    const verdict = judgeColor(req.color, got.color);
    const differs =
      got.color != null &&
      got.color.trim().toLowerCase() !== req.color.trim().toLowerCase();
    out.push({
      field: "color",
      requested: req.color,
      delivered: got.color,
      verdict,
      note: got.color == null ? "no data for color" : differs ? `variant: requested ${req.color}, available ${got.color}` : "exact",
    });
  }
  if (req.dimmable)
    push("dimmable", req.dimmable, got.dimmable, judgeDimmable(req.dimmable, got.dimmable));

  return out;
}

// Strengste afwijking telt: rood > geel > groen (invariant §4.3).
// 'onbekend' verslechtert de status NIET (ontbrekend ≠ afwijkend) maar maakt een
// kandidaat wel "lijst 2"-materiaal (C-08).
export function worstVerdict(deviations: MatchDeviation[]): FieldVerdict {
  if (deviations.some((d) => d.verdict === "rood")) return "rood";
  if (deviations.some((d) => d.verdict === "geel")) return "geel";
  if (deviations.some((d) => d.verdict === "onbekend")) return "onbekend";
  return "groen";
}

export function hasUnknown(deviations: MatchDeviation[]): boolean {
  return some(deviations, "onbekend");
}
export function hasRed(deviations: MatchDeviation[]): boolean {
  return some(deviations, "rood");
}
export function hasYellow(deviations: MatchDeviation[]): boolean {
  return some(deviations, "geel");
}
function some(deviations: MatchDeviation[], v: FieldVerdict) {
  return deviations.some((d) => d.verdict === v);
}

// C-02: SKU-normalisatie — "SAS100-BK" ≈ "SAS100.BK" ≈ "sas 100 bk".
export function normalizeSku(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
