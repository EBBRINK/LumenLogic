// ÉÉN containerbreedte, en een bronscan die dat vasthoudt.
//
// Aanleiding (UX-audit, bak 2 item 1): op productie waren er VIJF verschillende
// inhoudsbreedtes gemeten op `main.getBoundingClientRect()` bij viewport 1512 —
// navbalk 1152, /catalog en /settings 1152, /projects en het hele dossier 1024,
// /data/evaluation 896, plus twee admin-formulieren op 768. Gevolg: de linkerrand
// van de inhoud sprong bij elke navigatie opzij, en juist de meestgebruikte
// schermen (het dossier) stonden 64px uit het lood met het logo en de navigatie.
//
// Besluit: één breedte, `max-w-7xl` = 1280px. Dat is niet de meest voorkomende
// waarde van vandaag (dat was 1152) maar de waarde die DESIGN.md §5 voorschrijft:
// "Containers: mobiel/tablet vol breed · desktop max. 1280 px · ultrawide max.
// 1440 px". Omdat 1280 BREDER is dan 1152 moest de navbalk mee — anders keert de
// scheefstand alleen om.
//
// Dit bestand is het mechanisme dat voorkomt dat het opnieuw in vijf breedtes
// uiteenvalt. Het rendert niets: het leest de bron als tekst en kijkt naar élk
// `<main>` in de app- en componentenboom. Een nieuwe pagina met een eigen breedte
// valt er automatisch in. `?raw` + import.meta.glob i.p.v. node:fs, want de testrun
// staat in de browser (zie vitest.config.ts) — zelfde aanpak als de bronscan
// onderaan lib/uuid.test.ts.
import { expect, test } from "vitest";

/** De enige toegestane paginacontainer. DESIGN.md §5: desktop max. 1280px. */
const CONTAINER = "max-w-7xl";

// ── Uitzonderingen ───────────────────────────────────────────────────────────
//
// Een uitzondering is hier een BESLUIT, geen restje. Elke regel noemt de reden;
// staat er geen reden, dan hoort de regel er niet te staan. De test hieronder
// controleert ook dat elke uitzondering nog bestaat én nog echt afwijkt, zodat de
// lijst niet stilletjes verjaart.
const BEWUSTE_UITZONDERINGEN: Record<string, { breedte: string; waarom: string }> = {
  "components/login-form.tsx": {
    breedte: "max-w-sm",
    waarom:
      "Inlogscherm: één veld en één knop, gecentreerd, en er is geen navbalk " +
      "(de gebruiker is nog niet ingelogd) — dus geen rand om mee uit te lijnen.",
  },
  "app/error.tsx": {
    breedte: "max-w-3xl",
    waarom:
      "Gecentreerde doodlopende staat (kop + zin + knoppen, text-center), geen " +
      "inhoudspagina met een linkerrand. Op 1280px wordt dat een lege bak.",
  },
  "app/not-found.tsx": {
    breedte: "max-w-3xl",
    waarom:
      "Zelfde vorm en zelfde reden als app/error.tsx; de twee horen als één paar " +
      "te lezen en houden daarom dezelfde breedte.",
  },
  "app/global-error.tsx": {
    breedte: "max-w-3xl",
    waarom:
      "Zelfde reden als app/error.tsx, en hier dwingend: dit scherm rendert zijn " +
      "eigen <html>/<body> zónder navbalk, er ís geen rand om mee uit te lijnen.",
  },
};

// Nog te doen, bewust niet stilzwijgend: deze twee stonden tijdens de sweep onder
// handen bij een andere sessie (guardrail) en zijn doorgegeven aan Timo. Ze mogen
// hun OUDE waarde houden of al op CONTAINER staan — een derde breedte niet, want
// dan is het gat weer een gat. Zodra ze om zijn: regel hier weg.
const NOG_TE_DOEN: Record<string, string> = {
  // app/analytics/** is eigendom van de 2.1/2.2-sessie en wordt hier bewust niet
  // aangeraakt. Moet max-w-7xl worden zodra die sessie klaar is; haal deze regel
  // dan weg, dan bewaakt de scan hem vanzelf.
  "app/analytics/page.tsx": "max-w-6xl",
};

// ── Bronscan ─────────────────────────────────────────────────────────────────

const appBron = import.meta.glob<string>("../app/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});
const componentBron = import.meta.glob<string>("./**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * Commentaar eruit vóór het matchen: dit is een commentaarrijke repo en de
 * toelichtingen bóven de uitzonderingen noemen `max-w-3xl` letterlijk. Zonder deze
 * stap zou zo'n comment als een tweede container tellen.
 */
function zonderCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const bestanden = Object.entries({ ...appBron, ...componentBron })
  .map(([pad, bron]) => ({
    // "../app/settings/page.tsx" → "app/settings/page.tsx", "./nav-link.tsx" →
    // "components/nav-link.tsx".
    pad: pad.startsWith("../")
      ? pad.replace(/^\.\.\//, "")
      : pad.replace(/^\.\//, "components/"),
    code: zonderCommentaar(bron),
  }))
  // Testbestanden bouwen hun eigen schil om een component heen; die schil is geen
  // paginacontainer. Ze worden apart getoetst, helemaal onderaan.
  .filter((b) => !b.pad.includes(".test."))
  .sort((a, b) => a.pad.localeCompare(b.pad));

/** Elk `<main className="...">` in een bestand, met de max-w-klasse eruit gelicht. */
function mainsIn(code: string): { klassen: string; breedte: string | null }[] {
  const treffers = [...code.matchAll(/<main\s+className="([^"]*)"/g)];
  return treffers.map((m) => ({
    klassen: m[1],
    breedte: m[1].match(/(?:^|\s)(max-w-[\w[\]().%-]+)/)?.[1] ?? null,
  }));
}

const paginas = bestanden
  .map((b) => ({ pad: b.pad, mains: mainsIn(b.code) }))
  .filter((b) => b.mains.length > 0);

// ── Vangnet onder het vangnet ────────────────────────────────────────────────
//
// Levert de glob niets op, dan zijn alle tests hieronder leeg-en-dus-groen. Dat is
// het ergste soort testfout, dus dit staat als eerste.
test("bronscan: de app- en componentenboom worden écht gevonden", () => {
  expect(bestanden.length).toBeGreaterThan(50);
  expect(paginas.length).toBeGreaterThan(20);
  const paden = paginas.map((p) => p.pad);
  expect(paden).toContain("app/settings/page.tsx");
  expect(paden).toContain("app/projects/[id]/layout.tsx");
  expect(paden).toContain("app/data/evaluation/page.tsx");
  expect(paden).toContain("components/login-form.tsx");
});

// ── De regel ─────────────────────────────────────────────────────────────────

test(`elke paginacontainer is ${CONTAINER} (1280px, DESIGN.md §5)`, () => {
  const afwijkend = paginas
    .filter((p) => !(p.pad in BEWUSTE_UITZONDERINGEN) && !(p.pad in NOG_TE_DOEN))
    .flatMap((p) =>
      p.mains
        .filter((m) => m.breedte !== CONTAINER)
        .map((m) => `${p.pad} → ${m.breedte ?? "(geen max-w)"}`),
    );

  // toEqual([]) en niet toHaveLength(0): bij rood staan de dader-paden in de
  // foutmelding, en dat is precies wat je dan wil weten.
  expect(afwijkend).toEqual([]);
});

test("elk <main> heeft überhaupt een breedte — 'geen max-w' is ook een afwijking", () => {
  const zonder = paginas
    .flatMap((p) => p.mains.map((m) => ({ pad: p.pad, ...m })))
    .filter((m) => m.breedte === null)
    .map((m) => `${m.pad} → ${m.klassen}`);
  expect(zonder).toEqual([]);
});

test("de uitzonderingenlijst verjaart niet: elke regel bestaat nog en wijkt nog af", () => {
  for (const [pad, { breedte, waarom }] of Object.entries(BEWUSTE_UITZONDERINGEN)) {
    const pagina = paginas.find((p) => p.pad === pad);
    // Bestaat het bestand niet meer (of heeft het geen <main> meer), dan hoort de
    // regel weg — anders dekt de allowlist een pad dat niemand meer kent.
    expect(pagina, `uitzondering voor ${pad} verwijst naar een <main> die er niet meer is`)
      .toBeDefined();
    for (const m of pagina!.mains) {
      expect(m.breedte, `${pad} zou ${breedte} zijn (${waarom})`).toBe(breedte);
    }
  }
});

test("nog-te-doen: de doorgegeven schermen staan op hun oude waarde of al op de nieuwe", () => {
  for (const [pad, oud] of Object.entries(NOG_TE_DOEN)) {
    const pagina = paginas.find((p) => p.pad === pad);
    expect(pagina, `${pad} staat in NOG_TE_DOEN maar heeft geen <main> meer`).toBeDefined();
    for (const m of pagina!.mains) {
      expect(
        [oud, CONTAINER],
        `${pad} kreeg een DERDE breedte (${m.breedte}) — dat is precies de versplintering ` +
          `die deze test moet stoppen. Zet hem op ${CONTAINER} en haal de regel uit NOG_TE_DOEN.`,
      ).toContain(m.breedte);
    }
  }
});

// ── De chrome eromheen ───────────────────────────────────────────────────────
//
// De navbalk is geen <main> maar wél de referentie waar de audit tegenaan keek: het
// logo en het eerste navigatie-item bepalen waar de linkerrand hóórt te liggen.
// Loopt die uit de pas met de pagina's, dan is de scheefstand alleen omgedraaid.
// De vergelijkbalk zweeft over /catalog en /products/[id] en heeft dezelfde plicht.
const CHROME: Record<string, string> = {
  "components/nav-link.tsx": "de navbalk — de referentie voor de linkerrand",
  "components/product/compare-tray.tsx": "de vergelijkbalk over /catalog en /products/[id]",
};

test(`de navbalk en de vergelijkbalk delen dezelfde ${CONTAINER}-container`, () => {
  for (const [pad, wat] of Object.entries(CHROME)) {
    const bestand = bestanden.find((b) => b.pad === pad);
    expect(bestand, `${pad} niet gevonden in de bronscan`).toBeDefined();
    const breedtes = [...bestand!.code.matchAll(/(?:^|\s)(max-w-[\w[\]().%-]+)/g)].map(
      (m) => m[1],
    );
    expect(breedtes, `${pad} (${wat}) heeft geen enkele max-w-klasse meer`).not.toEqual([]);
    // Alle max-w in deze twee bestanden zijn containerbreedtes; komt er ooit een
    // inhoudslimiet bij, splits dan de assertie in plaats van hem te verzwakken.
    for (const b of breedtes) {
      expect(b, `${pad} (${wat}) moet met de paginacontainer meelopen`).toBe(CONTAINER);
    }
  }
});
