const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
});

export function formatEur(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return euro.format(n);
}

// Hele getallen mét duizendtalgroepering, zelfde locale-familie als formatEur — zodat
// "211317" niet als één ononderbroken cijferbrij op het scherm staat (UX-audit 30 jul,
// bug #9). nl-NL groepeert met een punt: 211.317. Geen decimalen: dit zijn tellingen.
const integer = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 });

export function formatInt(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return integer.format(n);
}

// ── Datums: ÉÉN formaat voor de hele app (UX-audit 30 jul, bug #9) ─────────────────────
// De app draaide met drie: `30 jul, 12:24` (nl-NL, zonder jaar), `09-07-2026` en de kale
// ISO-slice `2026-07-30`. Gekozen: en-GB met een geschreven maand — Engelse UI, EU-volgorde
// (dag vóór maand) en géén 03/04-ambiguïteit tussen dd/mm en mm/dd. 24-uursklok.
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `30 Jul 2026` — de datum alleen. */
export function formatDate(
  value: string | number | Date | null | undefined,
): string {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** `30 Jul 2026, 12:24` — datum mét tijdstip, voor logs en audit-sporen. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}
