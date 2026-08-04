// Health-endpoint voor de uptime-monitor — sprint 3, technische schuld "minimale
// monitoring vóór externen".
//
// WAAROM EEN EIGEN ENDPOINT EN NIET GEWOON `/login` PINGEN. Een monitor die de
// homepage opvraagt meet of Vercel de pagina serveert, niet of de app wérkt. De
// storing die we willen vangen is de database die wegvalt: Next blijft dan vrolijk
// HTML terugsturen terwijl elk scherm met data leeg of stuk is. Daarom raakt deze
// check de database echt aan.
//
// WAT DIT ENDPOINT BEWUST NIET DOET:
//   • **Niets prijsgeven.** Het antwoord is `{"status":"ok"}` en verder niets — geen
//     versienummer, geen tabelnaam, geen foutmelding, geen tellingen. Dit is de enige
//     route die zonder sessie bereikbaar is en toch de database aanraakt; wat hij
//     teruggeeft is dus per definitie publiek. Een gelekte Postgres-foutmelding
//     vertelt een aanvaller welke database eronder zit en welke tabel ontbreekt.
//   • **Niet loggen.** IJzeren regel 5 gaat over zoekacties, matches en offertes —
//     een monitor die elke minuut pingt zou de events-tabel in een week met ~10.000
//     betekenisloze rijen vullen en daarmee juist de echte gebeurtenissen onvindbaar
//     maken.
//   • **Geen sessie eisen.** Een uptime-monitor logt niet in. De route staat daarom
//     als "open" in `lib/route-allowlist.ts` — bewust toegevoegd, want sinds 3.2a is
//     een route die niet in die tabel staat geweigerd.
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Nooit cachen: een gecachet antwoord meet de vorige minuut, niet deze.
export const dynamic = "force-dynamic";

/**
 * Hoe lang we op de database wachten voor we hem als stuk beschouwen.
 *
 * Zonder deze grens hangt de request net zo lang als de database erover doet, en dan
 * bepaalt de timeout van de monitor wat er gebeurt — die geeft "geen antwoord", wat
 * niet te onderscheiden is van "de hele app ligt plat". Met deze grens antwoorden we
 * zelf 503, en dat is een ander en preciezer signaal: de app leeft, de database niet.
 */
const DB_TIMEOUT_MS = 5_000;

export async function GET() {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // De oorzaak gaat bewust níet mee in het antwoord (zie de kop). Wie de reden wil
    // weten, kijkt in de Vercel-logs — daar hoort hij, want daar is hij niet publiek.
    return Response.json({ status: "degraded" }, { status: 503 });
  }

  return Response.json({ status: "ok" }, { status: 200 });
}
