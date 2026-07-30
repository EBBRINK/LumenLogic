import { notFound } from "next/navigation";

// Eén plek die beslist of een route-param als uuid de database in mag.
//
// WAAROM DIT BESTAAT (UX-audit 30 jul, bug #1): de ruwe param ging rechtstreeks in
// een uuid-kolomvergelijking (`eq(brands.id, brandId)`). Postgres gooit dan
// `invalid input syntax for type uuid`, die fout is nergens afgevangen, en de
// gebruiker krijgt een 500 op een adres dat simpelweg niet bestaat. Het antwoord
// hoort 404 te zijn — hetzelfde antwoord als een id dat wél een uuid is maar geen
// rij heeft, want naar buiten is dat exact dezelfde situatie.
//
// Waarom een eigen bestandje en niet in lib/utils.ts: dat bestand is de shadcn-`cn`
// en wordt door élk UI-component geïmporteerd. Deze module trekt `next/navigation`
// mee (requireUuid) en hoort dus niet in die importketen.
//
// STRIKTER dan het patroon dat inline in de ocr-image-route stond
// (`/^[0-9a-f-]{36}$/i` liet ook 36 streepjes door) en strikter dan Postgres zelf:
// pg accepteert ook `{…}` en de vorm zonder streepjes. Dat mag hier een 404 worden —
// elke id in deze app komt uit gen_random_uuid()/randomUUID() en staat dus canoniek
// in de URL. Geen versie- of variantcheck: de vraag is "houdt de cast", niet "is dit
// een geldige RFC-4122-v4".
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Type-predicate, niet zomaar boolean: de aanroepers krijgen vaak een
// `string | undefined` uit searchParams en kunnen na deze check meteen door.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

// Voor server-componenten: één regel per pagina, direct na het uitpakken van params
// en vóór de eerste query. Route handlers gebruiken isUuid() zelf — die kunnen
// not-found.tsx niet renderen en geven een kale 404-Response.
//
// DE REGEL, één keer opgeschreven omdat de eerste reparatieronde er twee
// tegenstrijdige varianten van in de boom liet staan:
//
//   Elke render-eenheid die een route-param in een uuid-kolom stopt, guardt hem ZELF.
//
// Geen enkele eenheid dekt een andere:
//  · Een layout en zijn pagina renderen CONCURRENT en zijn losse notFound/error-units.
//    Wie het eerst gooit bepaalt het antwoord, dus een ruwe cast-fout in de één wint van
//    een nette notFound() in de ander. Dat geldt béide kanten op: de guard in
//    app/projects/[id]/layout.tsx maakt de guard in de pagina's dus NIET overbodig, en
//    omgekeerd. Beide zijn dezelfde regel, toegepast op twee eenheden.
//  · Een route handler draait helemaal geen layout — daar bestaat de layout-guard niet.
//    (app/projects/[id]/quote/pdf/route.ts was precies dát gat: 500, niet 404.)
//  · Bijeffect zonder guard: de sub-pagina vuurt zijn query alsnog af en die rejectt,
//    dus elk zo'n request laat een losse afgewezen DB-promise achter — óók als de
//    layout al netjes 404 had geantwoord.
//
// De dekking is afgedwongen in lib/uuid.test.ts ("guard-dekking"), niet door discipline:
// vier byte-identieke kopieën van dezelfde resolver zijn de reden dat één fix drie
// pagina's oversloeg.
export function requireUuid(...values: string[]): void {
  for (const value of values) {
    if (!isUuid(value)) notFound();
  }
}
