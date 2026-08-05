// De bewaker onder de projectacties (sprint 3.2a).
//
// `app/projects/**` bevat 30 server actions. Ze nemen allemaal een `dossierId` uit het
// formulier en muteren daarmee een project — en ze stonden allemaal achter niets meer dan
// `requireSession()`. Met een geldige sessie en de uuid van een ánder bedrijf schreef je
// dus in het project van dat bedrijf. Een route-allowlist die dat gat laat staan is een
// muur met een deur ernaast.
//
// Sinds 3.2a begint élke action met `bewaakProject()` uit `lib/project-poort.ts`, en dit
// bestand is wat die afspraak afdwingt. Zonder deze test is het een gewoonte.
//
// ⚠️ Dit is een VORM-test: hij bewijst dat de poort wordt aangeroepen, niet dat hij werkt.
// Dat tweede staat in `lib/repo/toegang.test.ts` (twee organisaties, echte query's) en in
// `app/projects/projects-gate.test.ts` (uitgelogd → /login, database ongewijzigd).
import { expect, test } from "vitest";

const bronnen = import.meta.glob("/app/projects/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const actieBestanden = Object.entries(bronnen).filter(
  ([pad]) => pad.endsWith("/actions.ts") || pad.endsWith("-actions.ts"),
);

/** Elke `export async function naam(` in een bronbestand, met zijn body tot de volgende. */
function actiesIn(bron: string): { naam: string; body: string }[] {
  const stukken = bron.split(/\nexport async function /).slice(1);
  return stukken.map((s) => ({ naam: s.split("(")[0], body: s }));
}

test("de bronbestanden zijn ingelezen (anders bewijst dit bestand niets)", () => {
  expect(actieBestanden.length).toBeGreaterThanOrEqual(5);
  expect(
    actieBestanden.some(([p]) => p.endsWith("/app/projects/actions.ts")),
  ).toBe(true);
  // Ondergrens met marge: gemeten op 3 aug 2026 zijn het er 30.
  const totaal = actieBestanden.reduce(
    (n, [, bron]) => n + actiesIn(bron).length,
    0,
  );
  expect(totaal).toBeGreaterThan(20);
});

test("élke server action in app/projects/** begint met bewaakProject()", () => {
  const zonderPoort: string[] = [];
  for (const [pad, bron] of actieBestanden) {
    for (const { naam, body } of actiesIn(bron)) {
      // "Als eerste" is hier niet "op regel 1" — een paar van deze acties hebben een
      // signatuur van tien regels met een uitgeschreven returntype. Wat telt is dat de
      // poort vóór de eerste databaseaanraking staat: een controle ná de eerste query is
      // geen poort maar een nabrander.
      const poort = body.search(/bewaakProject\s*\(/);
      const eersteDb = body.search(/\bdb\s*[.,)]/);
      if (poort < 0 || (eersteDb >= 0 && eersteDb < poort)) {
        zonderPoort.push(`${pad} → ${naam}`);
      }
    }
  }
  expect(
    zonderPoort,
    "Begin elke action met `const { toegang, scope } = await bewaakProject(formData)` " +
      "(of `(input)`) uit lib/project-poort.ts. Die doet sessie, route én eigendom in één " +
      "aanroep — requireSession() alleen zegt niets over wíens project dit is.",
  ).toEqual([]);
});

test("geen enkele projectactie leunt nog op een kale requireSession()", () => {
  const kaal: string[] = [];
  for (const [pad, bron] of actieBestanden) {
    // Comments mogen de naam noemen (ze leggen juist uit waaróm hij weg is); een aanroep
    // niet. Daarom op de aanroepvorm letten en niet op het kale voorkomen van de tekst.
    const zonderComments = bron
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (/\brequireSession\s*\(/.test(zonderComments)) kaal.push(pad);
  }
  expect(kaal).toEqual([]);
});

test("de poort komt uit lib/project-poort.ts en is niet per bestand overgeschreven", () => {
  // Eén poort, niet dertig. Staat de regel op dertig plekken, dan is het een kwestie van
  // tijd tot er één afwijkt — dezelfde reden waarom G36 in één bestand woont.
  const zonderImport = actieBestanden
    .filter(([, bron]) => /bewaakProject\s*\(/.test(bron))
    .filter(
      ([, bron]) =>
        !/import\s*\{[^}]*\bbewaakProject\b[^}]*\}\s*from\s*["']@\/lib\/project-poort["']/.test(
          bron,
        ),
    )
    .map(([pad]) => pad);
  expect(zonderImport).toEqual([]);
});
