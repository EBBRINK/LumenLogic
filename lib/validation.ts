// De invoerlaag van de app: één plek waar rauwe FormData een gecontroleerde vorm krijgt.
//
// WAAROM DIT BESTAAT (reviewzwerm 2.5a, A10): er stond geen enkele validatiebibliotheek in
// package.json en alle 68 exported server actions vertrouwden rauwe `FormData`. De review
// had in ronde 1 twee losse gevallen gemeld — een enum-crash (C3) en negatieve prijzen
// (C4) — en trok die zelf terug als framingsfout: het patroon is niet "twee actions missen
// een check", het is "er is geen validatielaag, en dit zijn de twee waar het toevallig
// opvalt". Elk nieuw formulierveld erfde dat.
//
// ── DE CONVENTIE ────────────────────────────────────────────────────────────────
//
//   1. Elke server action begint met een schema-parse. Geen `String(formData.get(…))`
//      en geen `as`-cast rechtstreeks een repo-functie of een db-kolom in.
//   2. Ná de parse vertrouwt de repo-laag zijn invoer. Repo-functies krijgen getypeerde
//      argumenten, geen FormData, en herhalen de vormcontrole niet.
//      Uitzondering: een DOMEINREGEL die geld of een klantdocument raakt hoort óók in de
//      repo (zie setDayPrice: price >= 0). Dat is geen vormcontrole maar een invariant,
//      en die hoort bij de data — niet bij het formulier dat er toevallig langskwam.
//   3. Ongeldige invoer is nooit een 500. Het antwoord is stil negeren (revalidate en
//      klaar), een `{ error }`-terugmelding, of `notFound()` — nooit een cast die
//      Postgres laat klappen.
//
// De bibliotheek is **zod**. Losse `includes`-checks per action zijn de duurdere weg naar
// hetzelfde punt: ze dekken één veld, ze zijn niet af te dwingen en ze vertellen de
// volgende bouwer niets.
//
// De volgorde is niet vrijblijvend: de SESSIEPOORT staat vóór de parse. Een beller die
// niet binnen mag, hoort niet te weten of zijn invoer goed was.
import { z } from "zod";
import { isUuid } from "@/lib/uuid";

// ── Bouwstenen ───────────────────────────────────────────────────────────────

// Uuid volgens lib/uuid.ts — strikter dan Postgres zelf, en dezelfde regel als de
// route-guards. Bewust niet z.uuid(): dan hebben we twee definities van "is dit een id".
export const zUuid = z.string().refine(isUuid, "geen geldige uuid");

// FormData geeft altijd strings; een leeg of whitespace-veld betekent "niet ingevuld".
export const zTrimmed = z.string().trim();
export const zOptionalText = zTrimmed.transform((s) => (s.length > 0 ? s : null));

// Een getal uit een formulier: Nederlandse komma toegestaan, lege waarde → null.
const numFromForm = z
  .string()
  .trim()
  .transform((s) => (s.length > 0 ? Number(s.replace(",", ".")) : null))
  .refine((n) => n == null || Number.isFinite(n), "geen geldig getal");

export const zOptionalNumber = numFromForm;

// Geld. Nooit negatief (C4) en nooit NaN/Infinity. Bedragen gaan als numeric(12,2) de
// database in, dus een absurd groot getal is óók invoerfout en geen afrondingsprobleem.
export const MAX_PRICE = 9_999_999.99;
export const zPrice = numFromForm.refine(
  (n) => n != null && n >= 0 && n <= MAX_PRICE,
  `bedrag moet tussen 0 en ${MAX_PRICE} liggen`,
);

// Een geheel getal met grenzen — de standaardvorm voor pagina's, tegels en aantallen.
export function zBoundedInt(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((s) => parseInt(s, 10))
    .refine((n) => Number.isInteger(n) && n >= min && n <= max, `moet tussen ${min} en ${max} liggen`);
}

// Een waarde uit een vaste lijst — de vorm voor élke kolom die in Postgres een enum is.
// Dit is de bouwsteen die C3 structureel oplost: een onbekende waarde wordt hier
// afgewezen in plaats van als `as`-cast een pgEnum in te gaan en 22P02 te geven.
export function zEnumFrom<T extends string>(values: readonly T[]) {
  return zTrimmed.refine((s): s is T => (values as readonly string[]).includes(s), {
    message: `moet één van: ${values.join(", ")}`,
  }) as unknown as z.ZodType<T>;
}

// ── De parse zelf ────────────────────────────────────────────────────────────

// FormData → gewoon object, zodat zod ermee kan werken. Bestanden blijven File; meerdere
// waarden onder dezelfde sleutel worden een array (zoals FormData ze ook bedoelt).
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key in out) {
      const bestaand = out[key];
      out[key] = Array.isArray(bestaand) ? [...bestaand, value] : [bestaand, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

// De aanroep die bovenaan elke action hoort te staan.
//
// Geeft een discriminated union in plaats van te throwen: de meeste actions horen bij
// slechte invoer stil niets te doen (regel 3 hierboven), en een throw zou daar juist de
// 500 opleveren die we wegnemen. Wie wél wil stoppen doet dat expliciet.
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseForm<T>(
  schema: z.ZodType<T>,
  formData: FormData,
): ParseResult<T> {
  const parsed = schema.safeParse(formToObject(formData));
  if (parsed.success) return { ok: true, data: parsed.data };
  // Alleen pad + melding, nooit de ingezonden waarde: die kan klantdata bevatten en
  // belandt anders via een foutmelding in een log of op een scherm.
  const eerste = parsed.error.issues[0];
  const pad = eerste?.path.join(".") || "invoer";
  return { ok: false, error: `${pad}: ${eerste?.message ?? "ongeldig"}` };
}

export { z };
