// De bewaker onder de rij-scoping (sprint 3.2a).
//
// De vraag die de briefing uit RLS wilde lenen: *kan iemand die morgen een nieuwe query
// schrijft de scoping per ongeluk overslaan?* Twee mechanismen zeggen nee, en dit bestand
// bewaakt het tweede:
//
//   1. **TypeScript.** De vier deuren op `project_dossiers` nemen een VERPLICHTE
//      `DossierScope`. Wie hem vergeet, compileert niet. Dat is de sterke helft.
//   2. **Deze scan.** TypeScript vangt niet dat iemand een VIJFDE deur bouwt — een nieuwe
//      `db.select().from(projectDossiers)` ergens anders, zonder scope. En hij vangt niet
//      dat app-code `ALLE_DOSSIERS` importeert en daarmee de hele muur omzeilt zonder ook
//      maar één rode regel.
//
// Zelfde vorm en dezelfde eerlijkheid als `lib/repo/authz-deuren.test.ts`.
//
// ⚠️ WAT DEZE SCAN NIET VANGT — expliciet, want een halve belofte is erger dan geen:
//   • rauwe SQL (`db.execute(sql\`select … from project_dossiers\`)`) of een tabel die via
//     een variabele wordt aangesproken. `lib/repo/analytics-tiles.ts` doet precies dat, en
//     die heeft zijn eigen `orgId`-parameter met een fail-closed uuid-controle (:134-140) —
//     daar sluit 3.2a op aan in plaats van er een tweede mechanisme naast te zetten;
//   • een leesfunctie die de scope wél aanneemt maar hem daarna niet gebruikt. Dat toetsen
//     de echte query-tests in `lib/repo/toegang.test.ts`, met twee organisaties naast elkaar;
//   • `db/` en `scripts/` — migraties en seeds mógen alles;
//   • testbestanden. Die zetten een uitgangssituatie klaar; ze voeren geen
//     gebruikershandeling uit. Precies daarom bestaat `ALLE_DOSSIERS` als export.
import { expect, test } from "vitest";

const bronnen: Record<string, string> = {
  ...(import.meta.glob("/app/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/components/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/lib/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

/**
 * De scoping-laag zelf plus de vier deuren. Deze mógen wat hieronder verboden is — zij
 * zíjn het mechanisme.
 */
const DEUREN = [
  "/lib/repo/toegang.ts", // de scope zelf
  "/lib/repo/dossiers.ts", // listDossiers + getDossier
  "/lib/repo/project-status.ts", // listDossiersFiltered + getRow (schrijfpad)
  "/lib/repo/orgs.ts", // setDossierOrg — de org-koppeling zelf
];

/**
 * `lib/ai/vangnet.ts` leest de FASE van een dossier waarvan de aanroeper de toegang al
 * bewezen heeft (het vangnet draait vanuit een action die door `bewaakProject()` is
 * gekomen). Het is dus geen ingang maar een vervolgstap — en hij leest één kolom, geen
 * projectgegevens. Uitgezonderd mét die reden erbij, niet omdat het uitkwam.
 */
const VERVOLGSTAPPEN = ["/lib/ai/vangnet.ts"];

function isTestinfrastructuur(pad: string): boolean {
  if (/\.test\.tsx?$/.test(pad)) return true;
  if (/-stubs\.tsx?$/.test(pad) && !pad.startsWith("/app/")) return true;
  if (pad.endsWith("/lib/test-actions.ts")) return true;
  return false;
}

/** Het hart van de scan, als pure functie — zodat de zelftests hieronder déze code toetsen. */
export function scopeOvertredingenIn(pad: string, bron: string): string[] {
  if (isTestinfrastructuur(pad)) return [];
  const gevonden: string[] = [];

  const isDeur = DEUREN.some((d) => pad.endsWith(d));
  const isVervolg = VERVOLGSTAPPEN.some((d) => pad.endsWith(d));

  // 1. Een vijfde deur: rechtstreeks van de tabel lezen buiten de scoping-laag om.
  if (!isDeur && !isVervolg && /\.\s*from\s*\(\s*projectDossiers\s*[),]/.test(bron)) {
    gevonden.push("leest rechtstreeks uit projectDossiers");
  }

  // 2. De ontsnapping gebruiken. `ALLE_DOSSIERS` bestaat voor migraties, seeds en tests;
  //    app-code haalt zijn scope uit `toegangScope(await bewaakRoute(…))`. Ook een
  //    handgeschreven `{ kind: "alles" }` telt — dat is dezelfde ontsnapping, overgetypt.
  if (!isDeur) {
    if (/\bALLE_DOSSIERS\b/.test(bron)) {
      gevonden.push("gebruikt ALLE_DOSSIERS");
    }
    if (/\{\s*kind\s*:\s*["']alles["']\s*\}/.test(bron)) {
      gevonden.push('schrijft { kind: "alles" } met de hand');
    }
  }

  return gevonden.map((g) => `${pad} ${g}`);
}

test("de bronbestanden zijn ingelezen (anders bewijst dit bestand niets)", () => {
  const paden = Object.keys(bronnen);
  expect(paden.length).toBeGreaterThan(50);
  for (const verwacht of [
    "/lib/repo/dossiers.ts",
    "/lib/repo/toegang.ts",
    "/app/projects/actions.ts",
    "/app/projects/page.tsx",
  ]) {
    expect(paden.some((p) => p.endsWith(verwacht)), verwacht).toBe(true);
  }
});

test("er is geen vijfde deur op project_dossiers, en niemand omzeilt de scope", () => {
  const overtredingen = Object.entries(bronnen).flatMap(([pad, bron]) =>
    scopeOvertredingenIn(pad, bron),
  );
  expect(
    overtredingen,
    "Lees projecten via listDossiers/getDossier (lib/repo/dossiers.ts) of " +
      "listDossiersFiltered (lib/repo/project-status.ts), en haal je DossierScope uit " +
      "toegangScope(await bewaakRoute(…)). ALLE_DOSSIERS is voor migraties, seeds en tests.",
  ).toEqual([]);
});

// ── Zelftest: élke vorm die de scan claimt te vangen, aantoonbaar ─────────────

const AANVALLEN: [naam: string, pad: string, bron: string][] = [
  [
    "een nieuwe query op de tabel, in een pagina",
    "/app/analytics/page.tsx",
    `const rijen = await db.select().from(projectDossiers).orderBy(x);`,
  ],
  [
    "dezelfde query in een repo-bestand dat geen deur is",
    "/lib/repo/rapportage.ts",
    `await db.select({ id: projectDossiers.id }).from(projectDossiers);`,
  ],
  [
    "de ontsnapping importeren in app-code",
    "/app/projects/page.tsx",
    `import { ALLE_DOSSIERS } from "@/lib/repo/toegang";\nawait listDossiers(db, ALLE_DOSSIERS);`,
  ],
  [
    "de ontsnapping overtypen in plaats van importeren",
    "/app/projects/page.tsx",
    `await listDossiers(db, { kind: "alles" });`,
  ],
  [
    "hetzelfde in een component",
    "/components/dossier/lijst.tsx",
    `await listDossiers(db, { kind: 'alles' });`,
  ],
];

for (const [naam, pad, bron] of AANVALLEN) {
  test(`de scan ziet: ${naam}`, () => {
    expect(scopeOvertredingenIn(pad, bron)).not.toEqual([]);
  });
}

const ONSCHULDIG: [naam: string, pad: string, bron: string][] = [
  [
    "de deur zelf",
    "/lib/repo/dossiers.ts",
    `await db.select().from(projectDossiers).where(dossierScopeSql(scope, projectDossiers.orgId));`,
  ],
  [
    "de scoping-laag zelf",
    "/lib/repo/toegang.ts",
    `export const ALLE_DOSSIERS: DossierScope = { kind: "alles" };`,
  ],
  [
    "een testbestand dat seedt",
    "/lib/repo/estimate.test.ts",
    `await getEstimateData(db, ALLE_DOSSIERS, dossierId);`,
  ],
  [
    "app-code die de scope netjes uit de toegang haalt",
    "/app/projects/page.tsx",
    `const toegang = await bewaakRoute("/projects");\nawait listDossiersFiltered(db, toegangScope(toegang), filter);`,
  ],
  [
    "de naam in een comment",
    "/app/data/page.tsx",
    `// projectDossiers wordt hier niet gelezen; dit scherm gaat over de catalogus.`,
  ],
];

for (const [naam, pad, bron] of ONSCHULDIG) {
  test(`de scan slaat niet aan op: ${naam}`, () => {
    expect(scopeOvertredingenIn(pad, bron)).toEqual([]);
  });
}
