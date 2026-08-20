// De live treffer-teller van /catalog (demosessie Brink Licht, 12 aug): tijdens het typen
// telt het aantal treffers mee, zonder enter. Dit is een count-only pad langs exact
// dezelfde WHERE-bouwers als searchProductsWithTotal — op een echte Postgres (PGlite) met
// de productie-migraties.
//
// Waar het hier om draait: het live-getal en het totaal ná de zoekactie mogen NOOIT
// verschillen. Elke test vergelijkt daarom de teller met wat de volledige zoekopdracht
// zelf als `total` rapporteert; wijkt dat af, dan telt de teller rijen waar de gebruiker
// nooit bij kan komen (of andersom).
import { expect, test } from "vitest";
import { count } from "drizzle-orm";
import { createTestDb, seedBrandProduct, addProductToBrand } from "@/db/test-db";
import { events } from "@/db/schema";
import {
  countSearchMatches,
  searchProductsWithTotal,
  type SearchOptions,
} from "@/lib/repo/products";

async function seedFamilie(n: number) {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "ENTERO VARIANT 01",
    kelvin: 2700,
  });
  for (let i = 2; i <= n; i++) {
    await addProductToBrand(db, {
      brandId,
      priceListId,
      name: `ENTERO VARIANT ${String(i).padStart(2, "0")}`,
      kelvin: 2700,
    });
  }
  return db;
}

// De invariant in één helper: teller ≡ total van de echte zoekopdracht.
async function tellerEnTotal(
  db: Awaited<ReturnType<typeof createTestDb>>,
  opts: Omit<SearchOptions, "limit">,
) {
  const teller = await countSearchMatches(db, opts);
  const { total, verbreed } = await searchProductsWithTotal(db, { ...opts, limit: 9 });
  expect(teller.total).toBe(total);
  // Ook de terugval moet gelijk lopen: zou de teller streng tellen waar de lijst breed
  // toont (of andersom), dan klopt het getal wel maar de melding eronder niet.
  expect(teller.verbreed).toBe(verbreed);
  return teller.total;
}

test("teller: fuzzy zoektekst telt exact wat de zoekopdracht zou tellen", async () => {
  const db = await seedFamilie(12);
  const n = await tellerEnTotal(db, { query: "ENTERO" });
  expect(n).toBe(12);
});

test("teller: verder typen versmalt het getal (het klant-scenario)", async () => {
  // "Ent" → beide families, "Entero" → alleen de ENTERO's. Dit is de versmalling via een
  // token dat LANGER wordt (substring-match). Sinds 20 aug versmalt een woord ERBIJ ook;
  // dat staat in de voor/na-meting onderaan dit bestand.
  const db = await seedFamilie(12);
  await seedBrandProduct(db, { brand: "Delta Light", name: "ENTASIS SPOT" });
  const breed = await tellerEnTotal(db, { query: "Ent" });
  const smal = await tellerEnTotal(db, { query: "Entero" });
  expect(breed).toBe(13);
  expect(smal).toBe(12);
});

test("teller: alleen merk (nog geen zoektekst) telt het hele merk", async () => {
  const db = await seedFamilie(5);
  const n = await tellerEnTotal(db, { query: "", brand: "Delta Light" });
  expect(n).toBe(5);
});

test("teller: exacte artikelcode telt langs dezelfde exacte tak", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ",
    articleCode: "L360048",
  });
  const n = await tellerEnTotal(db, { query: "L360048" });
  expect(n).toBe(1);
});

test("teller: specfilter telt in dezelfde adem als het filtert", async () => {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 WARM",
    kelvin: 3000,
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 KOEL",
    kelvin: 4000, // aantoonbaar niet gevraagd → uit teller
  });
  await addProductToBrand(db, {
    brandId,
    priceListId,
    name: "SASSO 100 ONBEKEND",
    kelvin: null, // ontbrekende data ≠ afkeuring → telt mee
  });
  const n = await tellerEnTotal(db, {
    query: "SASSO 100",
    filters: { kelvin: 3000 },
  });
  expect(n).toBe(2);
});

test("teller: een vervallen product telt MEE (regel 3, herschreven 19 aug)", async () => {
  const db = await seedFamilie(3);
  await seedBrandProduct(db, {
    brand: "GhostLux",
    name: "ENTERO PHANTOM EDITION",
    validUntil: "2020-01-01",
  });
  const n = await tellerEnTotal(db, { query: "ENTERO" });
  expect(n).toBe(4);
});

test("teller: zonder anker (geen merk, geen tekst) is het getal 0 en raakt hij de zoektak niet", async () => {
  const db = await seedFamilie(3);
  const { total, verbreed } = await countSearchMatches(db, { query: "", brand: "" });
  expect(total).toBe(0);
  expect(verbreed).toBe(false);
});

// ── DE VOOR/NA-METING VAN DE ZOEKSEMANTIEK ──────────────────────────────────────
//
// Tot 20 aug 2026 stonden de tokens in OR ("≥1 token aanwezig"). Gemeten op precies deze
// zaaiing was het gevolg dat een woord ERBIJ typen niets deed: "ENTERO" → 13,
// "ENTERO 2700" → 13, "ENTERO 2700 VARIANT 03" → 13. De demo-belofte (elk stukje
// informatie reduceert de stapel) kwam er niet uit.
//
// Sinds het besluit van 20 aug is de fuzzy-tak STRENG (élk woord moet voorkomen), met een
// zichtbare terugval naar breed als dat niets oplevert. Dezelfde zaaiing geeft nu 13 → 12
// → 1. Dat verschil is wat deze twee tests bewaken.
test("na de omzetting: elk woord erbij verkleint de stapel écht", async () => {
  const db = await seedFamilie(12);
  await seedBrandProduct(db, { brand: "Delta Light", name: "ENTERO 4000 SPECIAL" });

  const eenWoord = await tellerEnTotal(db, { query: "ENTERO" });
  const tweeWoorden = await tellerEnTotal(db, { query: "ENTERO VARIANT" });
  const vierWoorden = await tellerEnTotal(db, { query: "ENTERO VARIANT 03" });

  expect(eenWoord).toBe(13); // ook het 4000 SPECIAL-armatuur
  expect(tweeWoorden).toBe(12); // "VARIANT" sluit de SPECIAL uit
  expect(vierWoorden).toBe(1); // en "03" houdt er één over
});

test("terugval: geen enkel product heeft álle woorden → breed, en dat wordt gemeld", async () => {
  // Het OCR-scenario: één verschreven woord in de aanvraag. Streng levert nul op; zonder
  // terugval zou de gebruiker een lege lijst zien voor een product dat gewoon bestaat.
  const db = await seedFamilie(12);
  const teller = await countSearchMatches(db, { query: "ENTERO VERSCHRIJVING" });
  const { items, total, verbreed } = await searchProductsWithTotal(db, {
    query: "ENTERO VERSCHRIJVING",
    limit: 9,
  });

  expect(teller.total).toBe(12);
  expect(total).toBe(12);
  expect(items.length).toBe(9);
  // En het mag niet stil gebeuren — scherm én teller moeten het kunnen zeggen.
  expect(verbreed).toBe(true);
  expect(teller.verbreed).toBe(true);
});

test("terugval gebeurt niet bij één zoekwoord — daar is streng en breed hetzelfde", async () => {
  // Anders zou het scherm "brede variant" melden bij een zoekopdracht die nooit versmald is.
  const db = await seedFamilie(3);
  const teller = await countSearchMatches(db, { query: "ENTERO" });
  expect(teller.total).toBe(3);
  expect(teller.verbreed).toBe(false);
});

test("terugval naar nul is geen terugval", async () => {
  const db = await seedFamilie(3);
  const teller = await countSearchMatches(db, { query: "XYZZY PLUGH" });
  expect(teller.total).toBe(0);
  expect(teller.verbreed).toBe(false);
});

test("de teller schrijft géén event (regel 5 gaat over zoekacties, niet over toetsaanslagen)", async () => {
  // Zou de teller loggen, dan zet één ingetypte zoekterm een dozijn rijen in `events` en
  // maakt daarmee juist de échte gebeurtenis onvindbaar. De zoekopdracht zelf logt
  // onveranderd, mét totalCount — dat tweede deel is precies wat deze test bewaakt.
  const db = await seedFamilie(3);
  const [voor] = await db.select({ n: count() }).from(events);

  await countSearchMatches(db, { query: "ENT" });
  await countSearchMatches(db, { query: "ENTE" });
  await countSearchMatches(db, { query: "ENTERO" });
  const [naTellen] = await db.select({ n: count() }).from(events);
  expect(Number(naTellen.n)).toBe(Number(voor.n));

  await searchProductsWithTotal(db, { query: "ENTERO", limit: 9 });
  const [naZoeken] = await db.select({ n: count() }).from(events);
  expect(Number(naZoeken.n)).toBe(Number(voor.n) + 1);
});

// ── SPECWAARDEN UIT DE VRIJE TEKST ──────────────────────────────────────────────
//
// De reden dat dit bestaat staat in lib/spec-tokens.ts: "Entero 2700" zocht naar een
// productnaam die "2700" bevat, en die bestaat niet — de kleurtemperatuur staat in een veld.
// Hier wordt getoetst dat de vondst ook écht het specfilter-pad in gaat, en dat teller en
// lijst er hetzelfde van maken.

/** Een merk met drie armaturen op 2700K en één op 4000K, geen kelvin in de naam. */
async function seedKelvinFamilie() {
  const db = await createTestDb();
  const { brandId, priceListId } = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "ENTERO RD-S",
    kelvin: 2700,
  });
  await addProductToBrand(db, { brandId, priceListId, name: "ENTERO RD-M", kelvin: 2700 });
  await addProductToBrand(db, { brandId, priceListId, name: "ENTERO SQ-L", kelvin: 4000 });
  // Ontbrekende data is geen afkeuring: dit armatuur telt mee, ook zonder kelvin.
  await addProductToBrand(db, { brandId, priceListId, name: "MOUNTING KIT ENTERO", kelvin: null });
  return db;
}

test("het klantvoorbeeld werkt: 'Entero 2700' versmalt via kelvin in plaats van te verbreden", async () => {
  const db = await seedKelvinFamilie();

  const alles = await tellerEnTotal(db, { query: "Entero" });
  const met2700 = await tellerEnTotal(db, { query: "Entero 2700" });

  expect(alles).toBe(4);
  // Twee op 2700K + de mounting kit zonder kelvin (data ontbreekt ≠ afkeuring).
  // Het 4000K-armatuur valt aantoonbaar af. Vóór deze wijziging gaf dit nul strenge
  // treffers en dus een verbreding naar 4 — het getal ging omhoog terwijl je versmalde.
  expect(met2700).toBe(3);

  const teller = await countSearchMatches(db, { query: "Entero 2700" });
  expect(teller.verbreed).toBe(false);
  expect(teller.herkend).toEqual([
    { token: "2700", veld: "kelvin", waarde: 2700, toegepast: true },
  ]);
});

test("een expliciet ingevuld specveld wint van een geraden token", async () => {
  const db = await seedKelvinFamilie();
  // De gebruiker typte 2700 in de zoektekst maar vulde 4000 in het veld in. Het veld wint;
  // het token verdwijnt wél uit de tekstmatch (het was geen naamwoord) en het scherm hoort
  // te melden dat de gok genegeerd is.
  const teller = await countSearchMatches(db, {
    query: "Entero 2700",
    filters: { kelvin: 4000 },
  });
  const { total } = await searchProductsWithTotal(db, {
    query: "Entero 2700",
    filters: { kelvin: 4000 },
    limit: 9,
  });

  expect(teller.total).toBe(total);
  expect(teller.total).toBe(2); // het 4000K-armatuur + de kit zonder kelvin
  expect(teller.herkend[0]).toMatchObject({ veld: "kelvin", toegepast: false });
});

test("zonder anker wordt er niet gesplitst — anders levert een kaal getal nul op", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SERIE 2700 SPOT", kelvin: 3000 });
  // Alleen "2700" getypt, geen merk. Zou de herkenner hier toeslaan, dan bleef er een
  // specfilter zonder anker over en dus een lege lijst — terwijl er een product mét 2700
  // in de naam bestaat. De tekst blijft daarom tekst.
  const teller = await countSearchMatches(db, { query: "2700" });
  expect(teller.herkend).toEqual([]);
  expect(teller.total).toBe(1);
});

test("een artikelnummer blijft één geheel, ook als het op een specwaarde lijkt", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ",
    articleCode: "L360048",
  });
  const teller = await countSearchMatches(db, { query: "L360048" });
  expect(teller.total).toBe(1);
  expect(teller.herkend).toEqual([]);
});
