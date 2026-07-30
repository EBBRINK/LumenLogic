// Verwerkt de antwoorden van de zwerm. Read-only: raakt geen database, schrijft geen oordeel.
//
//   bun scripts/zwerm-lees.ts <runId>
//
// ── De default is 'onbewezen', niet 'goedgekeurd' ────────────────────────────
// Elke uitkomst die geen POSITIEVE bevestiging is — ontbrekende scherf, ontbrekende cel,
// ongeldige JSON, verkeerde hash, gemiste val, verzonnen citaat — telt als `onbeslist` en gaat
// naar de menselijke stapel. Er bestaat geen pad waarlangs de AFWEZIGHEID van een oordeel tot
// publiceren leidt. Dat is de hele reden dat dit bestand bestaat: een leeg antwoord moet luid
// falen in plaats van stil te slagen.
//
// Deze verwerker geeft ook geen toestemming. `assertSampleReviewed` blijft de enige sleutel op
// publishRun en Timo's steekproef blijft verplicht; de zwerm levert bewijs over de rijen die
// die steekproef NIET dekt.

import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const runId = process.argv[2];
if (!runId) throw new Error("gebruik: zwerm-lees.ts <runId>");
const map = `zwerm/${runId}`;

const OORDELEN = new Set(["goed", "nee-niet-in-naam", "nee-hoort-bij-onderdeel", "onzeker"]);

type Bevinding = { celId: string; oordeel: string; reden: string; namen: string[]; n: number };

async function main() {
  const bestanden = (await readdir(map)).sort();
  const scherven = bestanden.filter((f) => /^scherf-\d+\.json$/.test(f));
  const sleutel = JSON.parse(await readFile(`${map}/antwoordsleutel.json`, "utf8")) as Record<
    string,
    { val: boolean; tegenproef?: boolean; namen: string[] }
  >;

  let cellenTotaal = 0, beoordeeld = 0, ongeldigeScherven = 0;
  const perOordeel: Record<string, number> = {};
  const bevindingen: Bevinding[] = [];
  const vallen = { totaal: 0, gevonden: 0, gemist: [] as string[] };
  // Tegenproef: cellen die de voorstelpoort WEERDE als onderdeel, ononderscheidbaar meegemengd.
  // Ze toetsen het FILTER in plaats van alleen wat het doorlaat. Noemt een agent er één een
  // echt armatuur, dan is het naam-begin-anker te grof en weren we goede waarden.
  const tegen = { totaal: 0, bevestigd: 0, betwist: [] as string[] };
  const problemen: string[] = [];
  const prompts = new Set<string>();
  // Welke antwoordbestanden deze uitslag droeg, met hun wijzigingstijd. Een uitslag is een
  // momentopname: komt er later een antwoord bij of overheen, dan veroudert hij stil. Door de
  // bestanden te stempelen is achteraf te zien waarop een uitspraak gebaseerd was.
  const gelezen: string[] = [];

  for (const scherfNaam of scherven) {
    const scherf = JSON.parse(await readFile(`${map}/${scherfNaam}`, "utf8"));
    cellenTotaal += scherf.cellen.length;
    const antwoordPad = `${map}/${scherfNaam.replace(".json", ".antwoord.json")}`;

    let antwoord: {
      manifestHash?: string;
      promptHash?: string;
      gelezenCellen?: number;
      oordelen?: { celId: string; oordeel: string; bewijsNaam?: string; reden?: string }[];
    };
    try {
      antwoord = JSON.parse(await readFile(antwoordPad, "utf8"));
      const { stat } = await import("node:fs/promises");
      const st = await stat(antwoordPad);
      gelezen.push(`${scherfNaam.replace(".json", "")} · ${st.mtime.toISOString().slice(0, 19)}`);
    } catch {
      // Slot: een ontbrekende of onleesbare scherf is GEEN stilzwijgende goedkeuring.
      problemen.push(`${scherfNaam}: geen leesbaar antwoord — hele scherf ongeldig (${scherf.cellen.length} cellen onbeslist)`);
      ongeldigeScherven++;
      continue;
    }

    // Slot 2a — de hash moet kloppen: las de agent het bestand dat wij schreven?
    const hash = createHash("sha256")
      .update(scherf.cellen.map((c: any) => `${c.celId}:${c.veld}:${c.waarde}`).join("|"))
      .digest("hex")
      .slice(0, 16);
    if (antwoord.manifestHash !== hash) {
      problemen.push(`${scherfNaam}: manifestHash ${antwoord.manifestHash} ≠ ${hash} — hele scherf ongeldig`);
      ongeldigeScherven++;
      continue;
    }

    // Slot 2c — de PROMPT hoort bij het manifest. Antwoorden die onder verschillende
    // vraagstellingen tot stand kwamen, mogen niet worden samengevoegd: dan meet je niet wat
    // agents ervan vinden maar wat je ze gevraagd hebt. Zie de kanttekening in zwerm-export.ts.
    const verwachtePrompt = scherf.meta?.promptHash;
    if (verwachtePrompt && antwoord.promptHash !== verwachtePrompt) {
      problemen.push(
        `${scherfNaam}: promptHash ${antwoord.promptHash ?? "<ontbreekt>"} ≠ ${verwachtePrompt} — ` +
          `dit antwoord kwam onder een ANDERE vraagstelling tot stand; hele scherf ongeldig`,
      );
      ongeldigeScherven++;
      continue;
    }
    prompts.add(String(antwoord.promptHash ?? "-"));

    // Slot 2b — sluitende telling. Ontbreekt er één cel, dan is de HELE scherf ongeldig; er
    // wordt niet "de rest is goed" van gemaakt, want dan loont het om er een paar over te slaan.
    const gezien = new Map((antwoord.oordelen ?? []).map((o) => [o.celId, o]));
    const ontbreekt = scherf.cellen.filter((c: any) => !gezien.has(c.celId));
    const dubbel = (antwoord.oordelen ?? []).length - gezien.size;
    if (ontbreekt.length > 0 || dubbel > 0 || antwoord.gelezenCellen !== scherf.cellen.length) {
      problemen.push(
        `${scherfNaam}: ${ontbreekt.length} cel(len) ontbreken, ${dubbel} dubbel, ` +
          `gelezenCellen=${antwoord.gelezenCellen} vs ${scherf.cellen.length} — hele scherf ongeldig`,
      );
      ongeldigeScherven++;
      continue;
    }

    for (const cel of scherf.cellen) {
      const o = gezien.get(cel.celId)!;
      if (sleutel[cel.celId]?.tegenproef === true) {
        tegen.totaal++;
        if (o.oordeel === "goed") tegen.betwist.push(`${cel.celId}: ${cel.productnamen[0]}`);
        else tegen.bevestigd++;
        continue;
      }
      const isVal = sleutel[cel.celId]?.val === true;
      if (isVal) {
        vallen.totaal++;
        // Een val is correct herkend als hij NIET 'goed' heet.
        if (o.oordeel !== "goed") vallen.gevonden++;
        else vallen.gemist.push(cel.celId);
        continue; // vallen tellen niet mee in de inhoudelijke uitkomst
      }

      if (!OORDELEN.has(o.oordeel)) {
        problemen.push(`${cel.celId}: onbekend oordeel '${o.oordeel}' → onbeslist`);
        perOordeel["onbeslist"] = (perOordeel["onbeslist"] ?? 0) + 1;
        continue;
      }

      // Slot 3 — geen 'goed' zonder citaat dat werkelijk in DEZE cel staat. Een agent die niets
      // las kan dit niet verzinnen; dit is het goedkoopste en hardste slot dat er is.
      if (o.oordeel === "goed") {
        const geldig = (cel.productnamen as string[]).includes(o.bewijsNaam ?? "");
        if (!geldig) {
          problemen.push(`${cel.celId}: 'goed' met een bewijsNaam die niet in de cel staat → onbeslist`);
          perOordeel["onbeslist"] = (perOordeel["onbeslist"] ?? 0) + 1;
          continue;
        }
      }

      beoordeeld++;
      perOordeel[o.oordeel] = (perOordeel[o.oordeel] ?? 0) + 1;
      if (o.oordeel !== "goed") {
        bevindingen.push({
          celId: cel.celId,
          oordeel: o.oordeel,
          reden: o.reden ?? "",
          namen: cel.productnamen,
          n: cel.aantalProducten,
        });
      }
    }
  }

  const echteCellen = cellenTotaal - vallen.totaal - tegen.totaal;
  console.log(`\nzwerm-uitslag · run ${runId}`);
  console.log(`  scherven         : ${scherven.length} (${ongeldigeScherven} ongeldig)`);
  console.log(`  cellen           : ${echteCellen} echt + ${vallen.totaal} vallen`);
  console.log(`  positief beoordeeld: ${beoordeeld}`);
  for (const [k, v] of Object.entries(perOordeel).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${k.padEnd(26)} ${v}`);
  }
  console.log(
    `  val-recall       : ${vallen.gevonden}/${vallen.totaal}` +
      (vallen.gemist.length ? `  ← GEMIST: ${vallen.gemist.join(", ")}` : "  ✓"),
  );
  if (tegen.totaal > 0) {
    console.log(
      `  tegenproef       : ${tegen.bevestigd}/${tegen.totaal} geweerde onderdelen bevestigd` +
        (tegen.betwist.length ? "  ← ANKER MOGELIJK TE GROF:" : "  ✓ het anker weert terecht"),
    );
    for (const b of tegen.betwist) console.log(`      ${b}`);
  }

  console.log(`\n  gelezen antwoorden (deze uitslag geldt alleen hiervoor):`);
  for (const g of gelezen) console.log(`      ${g}`);
  if (prompts.size > 1) {
    console.log(
      `\n  ✗ ${prompts.size} VERSCHILLENDE promptHashes tussen de scherven — deze antwoorden zijn\n` +
        `    niet vergelijkbaar en horen niet in één uitslag.`,
    );
  }

  if (problemen.length) {
    console.log(`\nproblemen (${problemen.length}):`);
    for (const p of problemen) console.log(`  ${p}`);
  }

  if (bevindingen.length) {
    const producten = bevindingen.reduce((a, b) => a + b.n, 0);
    console.log(`\nAFGEKEURDE CELLEN — ${bevindingen.length} cellen, samen ${producten} producten:`);
    for (const b of bevindingen) {
      console.log(`  [${b.oordeel}] ${b.celId} · ${b.n} product(en)`);
      console.log(`     ${b.namen[0]}`);
      console.log(`     → ${b.reden}`);
    }
  }

  // ── Het eindoordeel ───────────────────────────────────────────────────────
  const schoon =
    prompts.size <= 1 &&
    tegen.betwist.length === 0 &&
    ongeldigeScherven === 0 &&
    vallen.gemist.length === 0 &&
    (perOordeel["onbeslist"] ?? 0) === 0 &&
    bevindingen.length === 0;
  console.log(
    `\n${schoon ? "✓ SCHOON — geen bezwaar uit de zwerm." : "✗ NIET SCHOON — dit gaat niet zo naar publicatie."}`,
  );
  if (!schoon) {
    console.log(
      `  Afgesproken regel: één afgekeurde cel op een landende rij ⇒ de HELE run afwijzen en\n` +
        `  kijken wat er misgaat. Een uitzondering per cel repareert de andere producten met\n` +
        `  dezelfde naamvorm niet.`,
    );
  }
  process.exit(schoon ? 0 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
