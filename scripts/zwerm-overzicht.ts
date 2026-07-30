// Eén overzicht om per merk te tekenen. Timo tekent per merk, dus hij moet per merk kunnen zien
// waar hij ja tegen zegt: hoeveel cellen, hoeveel goed, hoeveel afgekeurd, of de vallen gevonden
// zijn, of het ankerfilter überhaupt getoetst is, en hoeveel producten er achter hangen.
//
//   bun --env-file=.env.branch scripts/zwerm-overzicht.ts
//
// De cijfers komen uit `zwerm-lees.ts --json` — dezelfde verwerker die de sloten bewaakt. Dit
// script telt niets zelf; het zet alleen naast elkaar. (Zie het patroon "twee lagen die apart
// over hetzelfde oordelen" in HANDOVER.md: één teller, meerdere lezers.)
import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertBranchDb, logGuard } from "./branch-guard";

type Uitslag = {
  runId: string;
  scherven: number;
  ongeldigeScherven: number;
  echteCellen: number;
  perOordeel: Record<string, number>;
  productenPerOordeel: Record<string, number>;
  vallen: { totaal: number; gevonden: number; gemist: string[] };
  tegenproef: { totaal: number; bevestigd: number; betwist: string[] };
  problemen: string[];
  schoon: boolean;
};

const draai = promisify(execFile);

async function lees(runId: string): Promise<Uitslag | null> {
  // zwerm-lees.ts sluit af met code 1 zodra er bezwaar is — dat is geen fout maar een uitslag.
  let uit = "";
  try {
    uit = (await draai("bun", ["scripts/zwerm-lees.ts", runId, "--json"])).stdout;
  } catch (e) {
    uit = (e as { stdout?: string }).stdout ?? "";
  }
  try {
    return JSON.parse(uit.trim().split("\n").pop() ?? "");
  } catch {
    return null;
  }
}

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { getEnrichmentRun, getRunItems } = await import("@/lib/repo/enrichment");

  const mappen = (await readdir("zwerm", { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((n) => /^[0-9a-f]{8}-/.test(n));

  const rijen: Array<{
    merk: string; runId: string; status: string; cellen: number; goed: number; afgekeurd: number;
    onzeker: number; producten: number; productenAf: number; val: string; anker: string;
    schoon: boolean; ongeldig: number; poortversie: string;
  }> = [];

  for (const runId of mappen) {
    // Heeft deze run al antwoorden? Zonder antwoorden is er niets te tekenen.
    const bestanden = await readdir(`zwerm/${runId}`);
    if (!bestanden.some((f) => f.endsWith(".antwoord.json"))) continue;
    const run = await getEnrichmentRun(db, runId);
    if (!run) continue;
    const items = await getRunItems(db, runId);
    const u = await lees(runId);
    if (!u) continue;
    const merk = JSON.parse(await readFile(`zwerm/${runId}/${bestanden.find((f) => /^scherf-\d+\.json$/.test(f))}`, "utf8")).meta.merk;
    const af = Object.entries(u.perOordeel).filter(([k]) => k.startsWith("nee-"));
    rijen.push({
      merk,
      runId: runId.slice(0, 8),
      status: String((run as { status?: string }).status ?? "?"),
      // ── Poortversie: is deze run van ná de reparaties van 30 jul? ──────────
      // Machinaal te toetsen: `startEnrichmentRun` schrijft sinds de leeg-kolomreparatie
      // `counts.kolomAlGevuld`. Ontbreekt dat, dan is de run ouder en kunnen er voorstellen in
      // zitten die inmiddels zijn ingetrokken. Dit hoort als KOLOM in het overzicht en niet als
      // waarschuwing in proza: wie om negen uur 's ochtends per merk tekent, leest geen voetnoot.
      poortversie:
        (run.counts as Record<string, unknown> | null)?.kolomAlGevuld !== undefined
          ? "30 jul"
          : "OUD ⚠",
      ongeldig: u.ongeldigeScherven,
      cellen: u.echteCellen,
      goed: u.perOordeel["goed"] ?? 0,
      afgekeurd: af.reduce((a, [, v]) => a + v, 0),
      onzeker: u.perOordeel["onzeker"] ?? 0,
      producten: items.length,
      productenAf: Object.entries(u.productenPerOordeel).reduce((a, [, v]) => a + v, 0),
      val: u.vallen.totaal === 0 ? "—" : `${u.vallen.gevonden}/${u.vallen.totaal}`,
      anker: u.tegenproef.totaal === 0 ? "NIET getoetst" : `${u.tegenproef.bevestigd}/${u.tegenproef.totaal}`,
      schoon: u.schoon,
    });
  }

  rijen.sort((a, b) => b.producten - a.producten);
  const kop = ["merk", "run", "stand", "poortversie", "cellen", "goed", "afgekeurd", "onzeker", "voorstellen", "producten in bezwaar", "val-recall", "ankerfilter", ""];
  console.log(`\n| ${kop.join(" | ")} |`);
  console.log(`|${kop.map(() => "---").join("|")}|`);
  for (const r of rijen) {
    console.log(
      `| ${r.merk} | \`${r.runId}\` | ${r.status}${r.ongeldig ? ` ⚠${r.ongeldig} scherf(en) zonder antwoord` : ""} | ${r.poortversie} | ` +
        `${r.cellen} | ${r.goed} | ${r.afgekeurd} | ${r.onzeker} | ` +
        `${r.producten} | ${r.productenAf} | ${r.val} | ${r.anker} | ${r.schoon ? "✓ schoon" : "✗ bezwaar"} |`,
    );
  }
  const som = (f: (r: (typeof rijen)[0]) => number) => rijen.reduce((a, r) => a + f(r), 0);
  const merken = new Set(rijen.map((r) => r.merk));
  console.log(
    `\n${rijen.length} RUNS over ${merken.size} merken · ${som((r) => r.cellen)} cellen · ` +
      `${som((r) => r.producten)} voorstellen · ${som((r) => r.productenAf)} producten in bezwaar`,
  );
  if (rijen.length !== merken.size) {
    console.log(
      `  ⚠ die totalen tellen RUNS, niet unieke producten: sommige merken staan er meer dan één\n` +
        `    keer in (afgewezen runs en hun opvolger). Tel per merk, niet de kolom op.`,
    );
  }
  const oud = rijen.filter((r) => r.poortversie !== "30 jul");
  if (oud.length) {
    console.log(
      `\n⚠ poortversie OUD bij: ${oud.map((r) => `${r.merk} (${r.runId})`).join(", ")} — die run is van\n` +
        `  vóór de reparaties van 30 jul en kan voorstellen bevatten die sindsdien zijn ingetrokken.`,
    );
  }
  const zonderAnker = rijen.filter((r) => r.anker === "NIET getoetst").map((r) => r.merk);
  if (zonderAnker.length) {
    console.log(
      `\n⚠ ankerfilter NIET getoetst bij: ${zonderAnker.join(", ")} — daar waren geen geweerde\n` +
        `  onderdelen om als tegenproef mee te mengen, dus die rondes meten alleen wat het filter DOORLAAT.`,
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
