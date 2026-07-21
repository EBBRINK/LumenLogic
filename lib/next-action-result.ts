// Uitkomst van een server-action die vanuit een CLIENT component wordt geawait.
//
// LEES DIT VÓÓR JE HIER IETS "OPRUIMT" (docs/probleem-liegende-import-melding.md):
//
// Een server action die redirect() aanroept, laat zijn client-side promise niet
// resolven maar REJECTEN — Next' manier om "ik navigeer nu" te zeggen. Zie
// next/dist/client/components/router-reducer/reducers/server-action-reducer.js
// regel 215-234: bij een redirect doet de reducer reject(redirectError) en pas
// in de else-tak resolve(actionResult).
//
// Drie feiten die het ontwerp hieronder bepalen:
//
//  F1 — de reducer navigeert daarná zélf. De rejection opeten breekt de
//       navigatie dus niet.
//  F2 — rethrowen levert niets op: de error draagt handled=true, en een
//       rejection uit een async event handler bereikt nooit een React error
//       boundary (die vangen alleen render/lifecycle). unstable_rethrow zou hier
//       alleen een unhandledrejection opleveren. Het Next-advies "rethrow
//       internal errors" geldt voor render/RSC-context, niet voor een onSubmit.
//  F3 — NEXT_REDIRECT is GEEN synoniem voor succes. requireSession()
//       (lib/session.ts) doet redirect("/login") en staat als eerste regel in
//       elke action, vóór elke schrijfactie. Een verlopen sessie rejectet dus
//       legitiem met NEXT_REDIRECT terwijl er niets is gebeurd.
//
// Daarom classificeren we op BESTEMMING, niet op "is het een redirect", en is de
// default FALEN. Alleen een exacte match met de verwachte route telt als succes:
// een ten onrechte gemelde mislukking kost een blik in de events-log, een ten
// onrechte gemelde slaging is precies het defect dat we repareren — en op het
// OCR-pad kost dat geld.
//
// Bewust NIET gebruikt: unstable_rethrow. Die veegt NEXT_REDIRECT en
// NEXT_HTTP_ERROR_FALLBACK (notFound/forbidden/unauthorized) op één hoop, en die
// tweede groep is hier een échte fout die zichtbaar moet blijven.

export type ActionOutcome<T> =
  // Redirect naar de route die we verwachtten → geslaagd, Next navigeert al.
  | { kind: "arrived"; href: string }
  // Redirect naar /login → sessie verlopen; de action heeft niets gedaan.
  | { kind: "signedOut"; href: string }
  // Redirect ergens anders heen → onbekend, dus GEEN succes.
  | { kind: "divertedTo"; href: string }
  // De action heeft geantwoord ({ error } of void).
  | { kind: "value"; value: T }
  // Netwerkfout, 500, notFound() uit de action, crash — een echte fout.
  | { kind: "failed"; error: unknown };

const REDIRECT_CODE = "NEXT_REDIRECT";
const HTTP_FALLBACK_CODE = "NEXT_HTTP_ERROR_FALLBACK";

// De redirect-bestemming uit een NEXT_REDIRECT-error, of null als het er geen is.
// Digest: "NEXT_REDIRECT;<push|replace>;<href>;<status>;" (redirect.js:42-50).
// De href wordt met slice(2, -2).join(";") teruggeplakt — exact zoals Next' eigen
// isRedirectError het doet — want een href mág puntkomma's bevatten en
// split(";")[2] kapt hem dan af.
export function redirectHrefOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return null;
  const parts = digest.split(";");
  if (parts[0] !== REDIRECT_CODE) return null;
  if (parts[1] !== "push" && parts[1] !== "replace") return null;
  if (!Number.isFinite(Number(parts.at(-2)))) return null;
  const href = parts.slice(2, -2).join(";");
  return href === "" ? null : href;
}

// notFound() / forbidden() / unauthorized() uit een action. Géén navigatiesignaal
// voor ons: de action weigerde, en dat moet de gebruiker zien.
export function isAccessFallback(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.split(";")[0] === HTTP_FALLBACK_CODE;
}

// Alleen het pad vergelijken: de query verschilt per import (?pdf=20&run=…) en is
// juist het bewijs dat het gelukt is. Een relatieve href krijgt een dummy-origin.
function pathOf(href: string): string | null {
  try {
    return new URL(href, "http://lumenlogic.invalid").pathname;
  } catch {
    return null;
  }
}

// Roept de action aan en classificeert de uitkomst uitputtend.
//
// `expect.path` is het pad waar een GESLAAGDE action naartoe redirect — alleen
// dát telt als succes. Al het overige valt terug op een zichtbare melding.
export async function callAction<T>(
  run: () => Promise<T>,
  expect: { path: string },
): Promise<ActionOutcome<T>> {
  try {
    return { kind: "value", value: await run() };
  } catch (error) {
    const href = redirectHrefOf(error);
    if (href === null) return { kind: "failed", error };
    const path = pathOf(href);
    if (path === expect.path) return { kind: "arrived", href };
    if (path === "/login") return { kind: "signedOut", href };
    return { kind: "divertedTo", href };
  }
}

// De onderliggende oorzaak moet mee de UI in: zonder detail zijn een netwerkfout,
// een 500 en "an unexpected response was received" niet van elkaar te
// onderscheiden, en dan is de melding wéér een generieke dooddoener.
export function failureDetail(error: unknown): string {
  if (isAccessFallback(error)) {
    const status = (error as { digest: string }).digest.split(";")[1];
    return `the server refused the request (${status})`;
  }
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "unknown error";
}
