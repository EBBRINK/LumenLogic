// Unit-tests voor de uuid-guard (UX-audit 30 jul, bug #1).
//
// Wat hier bewezen moet worden is precies één ding: een kapotte route-param eindigt
// als notFound() en NIET als een doorgeschoten fout. Vóór deze guard ging de ruwe
// param in een uuid-kolomvergelijking, gooide Postgres `invalid input syntax for
// type uuid`, en zag de gebruiker een 500 op een adres dat niet bestaat.
//
// ANKER (zelfde aanpak als lib/next-action-result.test.ts): de fixture wordt gebouwd
// met Next' EIGEN notFound() en beoordeeld met onze isAccessFallback. Een zelf
// getypte digest-string zou de test groen houden terwijl productie iets anders doet.
import { expect, test } from "vitest";
import { notFound } from "next/navigation";
import { isAccessFallback } from "./next-action-result";
import { isUuid, requireUuid } from "./uuid";
// Bron-als-tekst voor de dekkingstests onderaan; `?raw` omdat de testrun in de browser
// staat en er dus geen node:fs is (zie de toelichting bij "Guard-DEKKING").
import brandPortalBron from "./repo/brand-portal.ts?raw";
import vangnetBron from "./ai/vangnet.ts?raw";

const GELDIG = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function gegooid(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

// ── isUuid ───────────────────────────────────────────────────────────────────

test("isUuid: canonieke uuids passeren, ook uit crypto.randomUUID()", () => {
  expect(isUuid(GELDIG)).toBe(true);
  expect(isUuid(GELDIG.toUpperCase())).toBe(true);
  expect(isUuid(crypto.randomUUID())).toBe(true);
});

test("isUuid: alles wat de databasecast zou laten klappen wordt geweigerd", () => {
  for (const kapot of [
    "", // lege segment
    "nope",
    "not-a-uuid",
    "12345",
    "%20",
    "../../etc/passwd",
    "3f2504e0-4f89-11d3-9a0c-0305e82c330", // 35 tekens
    "3f2504e0-4f89-11d3-9a0c-0305e82c33012", // 37 tekens
    "3f2504e04f8911d39a0c0305e82c3301", // zonder streepjes (pg zou dit slikken)
    "{3f2504e0-4f89-11d3-9a0c-0305e82c3301}", // pg-accolade-vorm
    "3f2504e0-4f89-11d3-9a0c-0305e82c330g", // 'g' is geen hex
    ` ${GELDIG}`,
    `${GELDIG}\n`,
  ]) {
    expect(isUuid(kapot), kapot).toBe(false);
  }
});

test("isUuid: het gat in het oude inline-patroon zit dicht", () => {
  // /^[0-9a-f-]{36}$/i (stond in de ocr-image-route) liet 36 streepjes door — dat
  // is exact de string die de cast wél bereikte en dus 500 gaf.
  const streepjes = "-".repeat(36);
  expect(/^[0-9a-f-]{36}$/i.test(streepjes)).toBe(true);
  expect(isUuid(streepjes)).toBe(false);
  // …en een geldige uuid blijft door beide patronen heen komen (geen regressie op
  // de route die het patroon eerst had).
  expect(/^[0-9a-f-]{36}$/i.test(GELDIG)).toBe(true);
  expect(isUuid(GELDIG)).toBe(true);
});

test("isUuid: niet-strings zijn geen uuid (params kunnen ontbreken)", () => {
  expect(isUuid(undefined)).toBe(false);
  expect(isUuid(null)).toBe(false);
  expect(isUuid(42)).toBe(false);
  expect(isUuid([GELDIG])).toBe(false);
});

// ── requireUuid: 404, geen 500 ───────────────────────────────────────────────

test("requireUuid: een geldige param laat de render gewoon doorlopen", () => {
  expect(() => requireUuid(GELDIG)).not.toThrow();
  expect(() => requireUuid(GELDIG, crypto.randomUUID())).not.toThrow();
});

test("requireUuid: een kapotte param gooit Next' notFound, geen gewone fout", () => {
  const e = gegooid(() => requireUuid("nope"));
  expect(e).not.toBeNull();
  // Ons oordeel: dit is een access-fallback (notFound/forbidden/unauthorized)…
  expect(isAccessFallback(e)).toBe(true);
  // …en specifiek de 404-variant. Digest: "NEXT_HTTP_ERROR_FALLBACK;404".
  expect((e as { digest: string }).digest.split(";")[1]).toBe("404");
  // Anker: byte-identiek aan wat notFound() zelf produceert.
  const eigen = gegooid(() => notFound());
  expect((e as { digest: string }).digest).toBe(
    (eigen as { digest: string }).digest,
  );
  // Het is dus GEEN databasefout die als 500 zou eindigen.
  expect((e as Error).message).not.toMatch(/invalid input syntax/);
});

test("requireUuid: elke param telt — de tweede kapotte wordt óók gepakt", () => {
  // De pagina's met twee ids (import/[runId], line/[lineId], upload/[uploadId])
  // vuren één query per id in dezelfde Promise.all; één kapotte is genoeg.
  expect(isAccessFallback(gegooid(() => requireUuid(GELDIG, "nope")))).toBe(true);
  expect(isAccessFallback(gegooid(() => requireUuid("nope", GELDIG)))).toBe(true);
});

// ── Guard-DEKKING ────────────────────────────────────────────────────────────
//
// De tests hierboven bewijzen dat de guard wérkt. Ze bewijzen niet dat hij ergens
// STÁÁT — en dat was precies het gat: de eerste reparatieronde zette de guard in één
// van de vier ?brand=-resolvers en in geen van de drie route handlers die hem nodig
// hadden. `/brand/data?brand=nope`, `/brand/dashboard?brand=nope`,
// `/brand/price-lists?brand=nope` en `/projects/nope/quote/pdf` gaven daarna nog 500.
//
// Vier byte-identieke kopieën van dezelfde resolver zijn geen discipline-probleem maar
// een structuurprobleem, dus dit is een BRONSCAN over de hele app-boom: nieuwe pagina's
// en routes vallen er automatisch in. `?raw` + import.meta.glob i.p.v. node:fs, want de
// testrun staat in de browser (zie vitest.config.ts).
const appBron = import.meta.glob<string>("../app/**/{page,layout,route}.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

// Commentaar eruit vóór het matchen: dit is een commentaarrijke repo en een guard die
// alleen in een toelichting voorkomt is geen guard. Andersom mag een comment de naam van
// een verboden patroon (`eq(brands.id, …)`) noemen zonder de test te laten falen.
function zonderCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const bestanden = Object.entries(appBron)
  .map(([pad, bron]) => ({
    // "../app/projects/[id]/page.tsx" → "app/projects/[id]/page.tsx"
    pad: pad.replace(/^\.\.\//, ""),
    code: zonderCommentaar(bron),
  }))
  .sort((a, b) => a.pad.localeCompare(b.pad));

// Vangnet onder het vangnet: als de glob niets (of bijna niets) oplevert, zouden alle
// dekkingstests hieronder leeg-en-dus-groen zijn. Dat is het ergste soort testfout.
test("guard-dekking: de bronscan vindt de app-boom écht", () => {
  expect(bestanden.length).toBeGreaterThan(20);
  expect(bestanden.map((b) => b.pad)).toContain("app/projects/[id]/page.tsx");
  expect(bestanden.map((b) => b.pad)).toContain(
    "app/projects/[id]/quote/pdf/route.ts",
  );
});

test("guard-dekking: élke dynamische route handler filtert zijn id met isUuid", () => {
  // Een route handler draait GEEN layout, dus de guard in app/projects/[id]/layout.tsx
  // bestaat op dit pad niet. Dit is de test die /projects/nope/quote/pdf → 500 had
  // gepakt: die route was de enige van de drie die de eerste ronde oversloeg.
  const UITZONDERING = new Set([
    // Better Auth' catch-all ([...all]); die krijgt geen id van ons en raakt geen
    // uuid-kolom — hij geeft de request rechtstreeks aan de auth-handler.
    "app/api/auth/[...all]/route.ts",
  ]);

  const dynamisch = bestanden.filter(
    (b) =>
      b.pad.endsWith("/route.ts") &&
      b.pad.includes("[") &&
      !UITZONDERING.has(b.pad),
  );
  // Ondergrens + de drie met naam, niet een exact aantal: een nieuwe, wél geguarde route
  // hoort deze test niet te laten falen — de lus hieronder is de echte assertie.
  expect(dynamisch.length).toBeGreaterThanOrEqual(3);
  expect(dynamisch.map((b) => b.pad)).toEqual(
    expect.arrayContaining([
      "app/projects/[id]/import/[runId]/markdown/route.ts",
      "app/projects/[id]/ocr-image/[runId]/[page]/route.ts",
      "app/projects/[id]/quote/pdf/route.ts",
    ]),
  );

  for (const { pad, code } of dynamisch) {
    expect(code, `${pad} mist de isUuid-import`).toContain('from "@/lib/uuid"');
    expect(code, `${pad} roept isUuid niet aan`).toMatch(/isUuid\(/);
    // …en een route handler kan not-found.tsx niet renderen, dus de uitkomst moet een
    // kale 404-Response zijn — in het Engels, zoals de rest van de UI.
    expect(code, `${pad} geeft geen 404-Response`).toMatch(/status:\s*404/);
    expect(code, `${pad} heeft nog een Nederlandse 404-tekst`).not.toContain(
      "niet gevonden",
    );
    expect(code, `${pad} heeft nog een Nederlandse 404-tekst`).not.toContain(
      "Niet gevonden",
    );
  }
});

test("guard-dekking: geen enkele ?brand=-pagina resolveert nog zelf", () => {
  // De kern van blocker 2: de resolver stond vier keer in de boom en de guard kwam maar
  // in één kopie terecht. Er is nu één resolver (lib/repo/brand-portal.ts) en de pagina's
  // mogen brands.id niet meer zelf aanraken — dan kán het niet meer uit elkaar lopen.
  const brandPaginas = bestanden.filter((b) => b.pad.startsWith("app/brand/"));
  expect(brandPaginas.map((b) => b.pad)).toEqual([
    "app/brand/dashboard/page.tsx",
    "app/brand/data/page.tsx",
    "app/brand/page.tsx",
    "app/brand/price-lists/page.tsx",
  ]);

  for (const { pad, code } of brandPaginas) {
    expect(code, `${pad} doet zijn eigen brands-query`).not.toMatch(
      /eq\(\s*brands\.id/,
    );
    expect(code, `${pad} gebruikt de gedeelde resolver niet`).toContain(
      "resolveBrandFromParam",
    );
  }
});

test("guard-dekking: de gedeelde merk-resolver guardt de queryparam", () => {
  // Zonder deze regel is de test hierboven een lege huls: vier pagina's die netjes
  // dezelfde ONgeguarde resolver aanroepen geeft nog steeds vier keer 500.
  const resolver = zonderCommentaar(brandPortalBron);
  const body = resolver.slice(resolver.indexOf("resolveBrandFromParam"));
  expect(body).toMatch(/isUuid\(\s*brandId\s*\)/);
  // Terugval op het eerste merk, niet notFound(): een kapotte queryparam hoort niet
  // strenger te zijn dan een geldige die niets vindt.
  expect(body).not.toContain("notFound(");
});

test("guard-dekking: élke dynamische pagina en layout guardt zijn eigen param", () => {
  // De regel staat bij requireUuid in lib/uuid.ts: layout en pagina renderen concurrent
  // en dekken elkaar dus NIET. Deze test is de handhaving daarvan.
  const NOG_TE_DOEN = new Set([
    // Twee bestanden waren tijdens deze reparatieronde in handen van een parallelle
    // sessie en konden hier niet aangepast worden. Zodra die zijn geland horen deze
    // regels weg — de test dekt ze dan automatisch.
    "app/projects/[id]/quote/page.tsx",
    "app/projects/[id]/review/page.tsx",
  ]);

  const dynamisch = bestanden.filter(
    (b) =>
      (b.pad.endsWith("/page.tsx") || b.pad.endsWith("/layout.tsx")) &&
      b.pad.includes("[") &&
      !NOG_TE_DOEN.has(b.pad),
  );
  // Ondergrens, geen exact aantal — zie de toelichting bij de route handlers.
  expect(dynamisch.length).toBeGreaterThanOrEqual(13);

  for (const { pad, code } of dynamisch) {
    expect(code, `${pad} mist requireUuid`).toContain('from "@/lib/uuid"');
    expect(code, `${pad} roept requireUuid niet aan`).toMatch(/requireUuid\(/);
  }
});

test("guard-dekking: lib/uuid.ts is de enige definitie van het patroon", () => {
  // Het losse `/^[0-9a-f-]{36}$/i` liet 36 streepjes door. De laatste kopie zat in
  // lib/ai/vangnet.ts (toolProductDetail) en gaf daar geen 500 — de per-regel-catch
  // logt hem als ai_vangnet_failed — maar wel een verspilde, betaalde modelcall.
  expect(zonderCommentaar(vangnetBron)).not.toMatch(/\[0-9a-f-\]\{36\}/);
  expect(zonderCommentaar(vangnetBron)).toMatch(/isUuid\(\s*id\s*\)/);
});
