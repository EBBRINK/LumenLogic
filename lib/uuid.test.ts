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
