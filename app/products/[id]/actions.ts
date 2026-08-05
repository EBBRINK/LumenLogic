"use server";
// J-03: pricerequest op een gated product → een lead (met lead-event). De human-gate blijft:
// dit maakt alleen een lead aan voor opvolging, er gaat niets automatisch naar buiten.
//
// ⚠️ DIT WAS HET ENIGE ONGEAUTHENTICEERDE SCHRIJFPAD IN DE APP
// (reviewzwerm 2.5a, B18 + C5). Drie dingen misten en zijn hier gerepareerd:
//
// 1. GEEN SESSIECHECK. Er stond `getSession()` om het e-mailadres te lézen, maar het
//    resultaat werd nooit getoetst — een niet-ingelogde bezoeker kon dus rijen inserten
//    in `leads` én `events`. Dat was verdedigbaar zolang de bijbehorende pagina bewust
//    open stond (J-03: een externe specifier vraagt een prijs aan). Die pagina staat nu
//    achter `requireSession()` (A5), dus dat argument vervalt: er is geen legitieme
//    anonieme beller meer. Dít is het expliciete standpunt dat de review vroeg —
//    anonieme leads zijn in deze fase niet de bedoeling, dus het pad gaat dicht.
//
//    Dat is geen intrekking van J-03. De aanvraagknop blijft bestaan en blijft werken;
//    hij is nu alleen bereikbaar voor iemand die door de poort is. Zodra het rollenmodel
//    er is (L-03/04) en er sessies bestaan die níet intern zijn, wordt de gate weer
//    zichtbaar voor precies de kijker waar hij voor bedoeld is — en dan blijft
//    `requireSession()` correct, want ook die specifier is ingelogd.
//
//    Waarom dit meer weegt dan "een aanvaller moet de action-id eerst uit de
//    clientbundle halen": GHSA-955p-x3mx-jcvp (unauthenticated disclosure of internal
//    Server Function endpoints) haalde die drempel weg. Zie A13.
//
// 2. GEEN UUID-GUARD, terwijl de bijbehorende pagina die wél heeft. Een niet-uuid ging
//    rechtstreeks een uuid-kolom in → `invalid input syntax for type uuid` → foutpagina
//    op een adres dat simpelweg niet bestaat. Het antwoord hoort 404 te zijn (lib/uuid.ts).
//    `productId` ging bovendien ongevalideerd de `redirect()` in.
//
// 3. GEEN REM. `leads` heeft buiten de PK geen index en geen dedup, en `listLeads` heeft
//    repo-breed nul aanroepers — geen route, geen scherm. Een tabel die niemand leest
//    groeit onopgemerkt vol, en leads zijn juist de commerciële opbrengst van de
//    tier-2-gate: loopt die vol met ruis, dan is er geen manier om de echte aanvragen
//    eruit te vissen. De sessiepoort is hier de rem — rate limiting bestaat nergens in
//    deze repo en hoort een aparte, bewuste bouwstap te zijn, niet een half laagje hier.
//    Zie HANDOVER.md.
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { createLead } from "@/lib/repo/disclosure";
import { bewaakNiveau } from "@/lib/route-toegang";
import { isUuid } from "@/lib/uuid";

export async function requestPriceAction(formData: FormData) {
  // Poort eerst, vóór élke uitspraak over de invoer: een anonieme beller hoort niet te
  // weten of een id bestaat.
  const toegang = await bewaakNiveau("iedereen", "requestPriceAction");

  const productId = String(formData.get("productId") ?? "").trim();
  const rawBrandId = String(formData.get("brandId") ?? "").trim();
  if (!isUuid(productId)) notFound();
  // brandId is optioneel (een merkloos product kan ook gated zijn); aanwezig én
  // onbruikbaar is wél een fout — dan klopt het formulier niet.
  if (rawBrandId.length > 0 && !isUuid(rawBrandId)) notFound();
  const brandId = rawBrandId.length > 0 ? rawBrandId : null;

  await createLead(db, {
    productId,
    brandId,
    userEmail: toegang.email,
  });
  // Terug naar de kaart met een bevestiging; de prijs blijft gated (extern), maar de aanvraag
  // staat nu als lead klaar voor Brink.
  redirect(`/products/${productId}?pricerequest=sent`);
}
