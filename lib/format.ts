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
// ISO-slice `2026-07-30`. Eén vorm: `30 Jul 2026` / `30 Jul 2026, 12:24`, 24-uursklok.
//
// DE TAALREGEL, expliciet omdat hij half Engels en half EU is (besluit Timo 30 jul, ook
// vastgelegd in HANDOVER.md — docs/DESIGN.md kent nog geen locale-regel):
//
//   getallen en bedragen EU (`211.317`, `€ 265,00`) · datums met een GESCHREVEN maand.
//
// De eerdere motivering ("en-GB, want de UI is Engels") is weggehaald: dat argument zou
// net zo goed `211,317` afdwingen, en dat doen we bewust níet. Het echte argument is
// smaller: de dd/mm-vs-mm/dd-verwarring bestaat alleen bij een dátum in louter cijfers.
// "30 Jul 2026" is in elke locale maar op één manier te lezen en staat daarom prima naast
// EU-getallen. `en-GB` is hier dus een implementatiedetail voor de woordvolgorde
// dag-maand-jaar, geen uitspraak over de rest van de app.
//
// TIJDZONE — VASTGEPIND, en dat is geen cosmetica (reparatie 30 jul, bevinding 8):
// zonder `timeZone` volgt Intl de tijdzone van het proces. Lokaal is dat Europe/Amsterdam,
// **op Vercel is dat UTC**. Een event van 11:00 stond in productie dus als "09:00" op het
// scherm, in een formaat dat er gezaghebbend uitziet, zonder zone erbij. De gebruikers
// zijn Nederlands en de events zijn hun werkdag, dus: Europe/Amsterdam. Bijvangst: de
// weergave is nu ook in de tests deterministisch, ongeacht `TZ`.
const TIME_ZONE = "Europe/Amsterdam";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

// Een kale kalenderdatum heeft geen tijdstip en dus geen zone. Hem toch door een
// zone-gepinde formatter halen is de klassieke off-by-one: `new Date("2026-07-06")` is
// middernacht UTC, en in een zone vóór UTC wordt dat 5 juli. In Europe/Amsterdam (UTC+1/+2)
// valt het nu toevallig goed, maar "valt toevallig goed" is geen garantie — deze formatter
// leest daarom de datumdelen zoals ze er staan en zet er geen zone overheen.
const dateOnlyFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// `date()`-kolommen (price_lists.valid_until, quotes.quote_date, manual_price_valid_until)
// komen als "2026-07-06" uit de driver.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `30 Jul 2026` — de datum alleen.
 *
 * Veilig voor een kale kalenderdatum ("2026-07-06"): die wordt gelezen zoals hij er staat.
 * LET OP de enige overgebleven scherpe rand: geef je een `Date` die zelf al uit een
 * date-only kolom komt, dan is de zone-informatie al weg vóórdat deze functie hem ziet.
 * Geef in dat geval de string door, niet een `new Date(...)` eromheen.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
): string {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    const d = toDate(`${value}T00:00:00Z`);
    return d ? dateOnlyFmt.format(d) : "—";
  }
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

/** `30 Jul 2026, 12:24` — datum mét tijdstip (Europe/Amsterdam), voor logs en audit-sporen. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}
