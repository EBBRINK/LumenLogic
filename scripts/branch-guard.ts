// De branch-poort: elk verrijkings-, publiceer- of meetscript rond de spec-vulling roept
// assertBranchDb() aan vóór de eerste query. Draait het per ongeluk tegen productie, dan
// breekt het af in plaats van te schrijven.
//
// ── Waarom fail-closed op een POSITIEF signaal ───────────────────────────────
// `bun --env-file=bestaat-niet.env script.ts` faalt NIET (geverifieerd) — bun start gewoon
// door en het script pakt stil wat er in de shell-omgeving staat. Dat kan de productie-
// DATABASE_URL zijn. Een guard die alleen kijkt "is dit NIET de productie-host" hangt dan
// aan een referentie die er misschien niet is, en laat een lege omgeving vrolijk door.
//
// Daarom is slot 1 een marker die ALLEEN in .env.branch staat: geen marker = geen run.
// Slot 2 (endpoint-vergelijking) is de dubbele bodem voor het geval iemand de marker naar een
// env-file kopieert die tóch naar productie wijst.
//
// De beslissing (beoordeelBranchDb) is bewust vrij van node:fs, zodat de test hem in de
// browser-runner van dit project kan draaien; het lezen van .env.local zit in de dunne
// async schil eronder.

const MARKER_ENV = "LUMENLOGIC_DB";
const MARKER_VALUE = "branch";

export type GuardResult = {
  endpoint: string;
  productionEndpoint: string | null;
  secondLock: "gecontroleerd" | "geen-referentie";
};

// Neon-endpoint uit een connection string: "ep-cool-darkness-123456" uit
// "ep-cool-darkness-123456-pooler.eu-central-1.aws.neon.tech". De -pooler-suffix eraf, zodat
// de gepoolde en ongepoolde string van dezelfde database als gelijk gelden — anders zou slot 2
// een productie-run met de andere variant doorlaten.
export function endpointOf(connectionString: string): string | null {
  try {
    const host = new URL(connectionString).hostname;
    return host.split(".")[0].replace(/-pooler$/, "") || null;
  } catch {
    return null;
  }
}

// De hele beslissing, puur: gooit als dit geen aantoonbare branch-database is.
export function beoordeelBranchDb(
  marker: string | undefined,
  url: string | undefined,
  prodEndpoint: string | null,
): GuardResult {
  // Slot 1 — positief signaal, fail-closed.
  if (marker !== MARKER_VALUE) {
    throw new Error(
      `GEBLOKKEERD: ${MARKER_ENV}=${MARKER_VALUE} ontbreekt (gezien: ${marker ?? "<niets>"}). ` +
        `Dit script draait uitsluitend tegen de Neon-branch. Draai het met ` +
        `--env-file=.env.branch. Let op: bun faalt NIET op een ontbrekende --env-file, dus ` +
        `deze melding betekent vaak dat het bestand er niet is en je zonder waarschuwing op ` +
        `de shell-omgeving (mogelijk PRODUCTIE) zat.`,
    );
  }

  if (!url) throw new Error("GEBLOKKEERD: DATABASE_URL ontbreekt — zie .env.branch");
  const endpoint = endpointOf(url);
  if (!endpoint) {
    throw new Error("GEBLOKKEERD: DATABASE_URL is geen geldige connection string");
  }
  // Elke Neon-endpoint heet 'ep-…'. Zonder deze toets glipt de placeholder uit .env.branch
  // ("postgresql://PLAK_HIER_…") door beide sloten heen — `new URL()` accepteert hem als host —
  // en faalt pas bij de driver, met een melding die niets over de poort zegt. Een half
  // ingevulde env-file hoort hier te stranden, niet drie stappen verderop.
  if (!/^ep-[a-z0-9-]+$/i.test(endpoint)) {
    throw new Error(
      `GEBLOKKEERD: '${endpoint}' ziet er niet uit als een Neon-endpoint (ep-…). Staat de ` +
        `connection string wel volledig in .env.branch?`,
    );
  }

  // Slot 2 — dubbele bodem: de marker mag niet boven een productie-string staan.
  if (prodEndpoint && prodEndpoint === endpoint) {
    throw new Error(
      `GEBLOKKEERD: ${MARKER_ENV}=${MARKER_VALUE} staat gezet, maar DATABASE_URL wijst naar ` +
        `de PRODUCTIE-endpoint (${endpoint}, gelijk aan die in .env.local). De marker is naar ` +
        `de verkeerde env-file gekopieerd.`,
    );
  }

  return {
    endpoint,
    productionEndpoint: prodEndpoint,
    secondLock: prodEndpoint ? "gecontroleerd" : "geen-referentie",
  };
}

// De productie-endpoint zoals .env.local hem kent. Ontbreekt die file (of staat er geen
// geldige URL in), dan levert dit null: slot 2 kan dan niets toetsen. Dat is precies waarom
// slot 1 de fail-closed is en deze niet.
export async function leesProductieEndpoint(repoRoot: string): Promise<string | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(`${repoRoot}/.env.local`, "utf8");
    const line = raw.split("\n").find((l) => l.trim().startsWith("DATABASE_URL="));
    if (!line) return null;
    return endpointOf(
      line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    );
  } catch {
    return null;
  }
}

// Breekt af tenzij dit aantoonbaar een branch-database is. Retourneert wat het gezien heeft,
// zodat het aanroepende script kan loggen waar het zat.
export async function assertBranchDb(
  repoRoot: string = process.cwd(),
): Promise<GuardResult> {
  return beoordeelBranchDb(
    process.env[MARKER_ENV],
    process.env.DATABASE_URL,
    await leesProductieEndpoint(repoRoot),
  );
}

// Eén regel output zodat elke run zichtbaar vastlegt tegen welke database hij draaide.
export function logGuard(g: GuardResult): void {
  console.log(
    `🔒 branch-poort open — endpoint ${g.endpoint} · tweede slot: ${g.secondLock}` +
      (g.secondLock === "geen-referentie"
        ? " (.env.local niet leesbaar; alleen de marker droeg deze run)"
        : ` (productie is ${g.productionEndpoint})`),
  );
}
