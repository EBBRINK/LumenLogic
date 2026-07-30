// Exporteert een verrijkingsrun naar scherf-bestanden voor de agent-zwerm.
//
//   bun --env-file=.env.branch scripts/zwerm-export.ts <runId> [--scherf=40]
//
// ── Waarom een BESTAND en niet de prompt ─────────────────────────────────────
// Een lange JSON-string in een prompt komt als brokstukken aan, en dan leest een half gelezen
// batch als een volledig beoordeelde batch. Agents krijgen dus een PAD. Ze krijgen ook géén
// databaseverbinding: schrijft een agent een `sampleVerdict` weg, dan is `assertSampleReviewed`
// automatisch tevreden en publiceert `publishRun` — dat is de doorgeklikte poort, geautomatiseerd.
//
// ── De eenheid is de CEL, en de sleutel is het SPEC-FRAGMENT ─────────────────
// Een cel is `veld | vorm van het spec-fragment | waarde`, waarbij het fragment de karakters
// zijn die de waarde voortbrachten (`specSpans()`, parser.ts) plus een venster van ±8 tekens.
// De agent beoordeelt dat patroon; het aantal producten erachter staat erbij, zodat zichtbaar
// is hoeveel er aan één oordeel hangt.
//
// De sleutel was eerst de HELE productnaam, en dat was te grof: bij Wever & Ducré gaf dat
// 8.560 cellen (58 scherven) tegen 1.556 op het fragment (11 scherven) — 82 % minder werk voor
// dezelfde vraag. `kelvin|# led #k b-b #w|2700` voegt `DOMY ON STREX 1.0 LED 2700K B-B` en
// `SOLID CEILING SURF 1.0 LED 2700K B-B` samen: verschillende families, identieke vraag
// (betekent `2700K` hier kleurtemperatuur 2700?). Dat samenvoegen ís de winst.
//
// ── Waarom de familienaam er NIET in zit, met de meting erbij ────────────────
// Het tegenargument was: dan belanden `POW.SUPPLY … 96W 48V` en `BELT … 96W 48V` in één cel
// terwijl ze een ander oordeel verdienen. Gemeten (`scripts/meet-celmenging.ts`) op Flos
// Architectural — het merk mét losse onderdelen — én mét de door de poort geweerde producten
// erbij, dus juist de robuustheidstoets voor "wat als het filter iets mist":
//
//     cellen met een onderdeel : 57      cellen die onderdeel én armatuur MENGEN : 0
//
// Nul, ook bij Wever & Ducré (36 met een onderdeel, 0 gemengd). De botsing waar de familienaam
// tegen zou beschermen, heeft geen enkele instantie — en hij kostte 12 extra scherven per merk.
// De vraag "is dit een armatuur?" hoort bovendien in een andere laag: het ankerfilter en de
// voorstelpoort, waar hij al zit. Daarom draagt de cel de onderdeelvlag als ATTRIBUUT, zodat de
// agent hem ziet zonder dat de cel erop splitst.
//
// ── De vier sloten tegen een leeg antwoord ───────────────────────────────────
//   1. `oordeel` is een verplichte enum — een ontbrekende cel is `ontbrekend`, niet `goed`.
//   2. Elke celId uit het manifest moet exact één keer terugkomen, en `manifestHash` moet
//      kloppen. Ontbreekt er één ⇒ de HELE scherf ongeldig, niet "de rest is goed".
//   3. Geen `goed` zonder `bewijsNaam`: een letterlijke productnaam uit díé cel. De lezer toetst
//      dat de string werkelijk in het manifest staat. Een agent die niets las, kan dit niet
//      verzinnen. Dit is het sterkste slot en het kost niets.
//   4. Vallen: cellen met een aantoonbaar verkeerde waarde, ingevoegd tussen de echte. Recall
//      moet 100 % zijn per scherf. Daarmee is "hoeveel heb je gelezen" toetsbaar in plaats van
//      zelfgerapporteerd.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { assertBranchDb, logGuard } from "./branch-guard";
import { getRunItems, getEnrichmentRun, nameShape } from "@/lib/repo/enrichment";
import { parseProductName, specSpans } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

const [, , runId, ...rest] = process.argv;
const scherfMaat = Number(rest.find((a) => a.startsWith("--scherf="))?.slice(9) ?? 40);
// Tegenproef: N producten die de voorstelpoort WEERDE als onderdeel, ononderscheidbaar tussen
// de echte cellen gemengd. Ze toetsen het FILTER in plaats van alleen wat het doorlaat: noemt
// een agent er één een echt armatuur, dan is het anker te grof. Het juiste antwoord is
// `nee-hoort-bij-onderdeel`.
const tegenproefN = Number(rest.find((a) => a.startsWith("--tegenproef="))?.slice(13) ?? 0);
// Contextvenster om de spec-span. Monotoon in het aantal cellen — er is geen natuurlijk
// optimum, dus dit is een ontwerpkeuze: genoeg tekens om de buren te zien die de waarde
// rechtvaardigen ("CRI 90" versus "C90 W"), niet zoveel dat de familienaam terugkomt.
const CONTEXT = Number(rest.find((a) => a.startsWith("--context="))?.slice(10) ?? 8);

// De vorm van het spec-fragment: de karakters die dit veld voortbrachten, plus context.
function fragmentVorm(naam: string, veld: string): string {
  const spans = specSpans(naam)
    .filter((s) => s.field === veld)
    .sort((a, b) => a.start - b.start);
  const s = spans[0];
  const stuk = s
    ? naam.slice(Math.max(0, s.start - CONTEXT), Math.min(naam.length, s.end + CONTEXT))
    : naam;
  return nameShape(stuk);
}

type Cel = {
  celId: string;
  veld: string;
  waarde: string;
  naamvorm: string;
  aantalProducten: number;
  productnamen: string[]; // maximaal 3, letterlijk uit de catalogus
  vlaggen: string[];
  val?: true; // alleen in het antwoordmodel van de lezer; staat NIET in het scherfbestand
};

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  if (!runId) throw new Error("gebruik: zwerm-export.ts <runId> [--scherf=40]");
  const { db } = await import("@/db/client");

  const run = await getEnrichmentRun(db, runId);
  if (!run) throw new Error(`run ${runId} niet gevonden`);
  const items = await getRunItems(db, runId);
  if (items.length === 0) throw new Error("run heeft geen items");

  // ── cellen bouwen ─────────────────────────────────────────────────────────
  const perCel = new Map<string, Cel>();
  for (const it of items) {
    const vorm = fragmentVorm(it.productName, it.field);
    const sleutel = `${it.field}|${vorm}|${it.value}`;
    const bestaand = perCel.get(sleutel);
    if (bestaand) {
      bestaand.aantalProducten++;
      if (bestaand.productnamen.length < 3) bestaand.productnamen.push(it.productName);
      continue;
    }
    perCel.set(sleutel, {
      celId: `c${String(perCel.size + 1).padStart(4, "0")}`,
      veld: it.field,
      waarde: it.value,
      naamvorm: vorm,
      aantalProducten: 1,
      productnamen: [it.productName],
      vlaggen: verdenkingen(it.productName, parseProductName(it.productName))
        .filter((v) => v.veld === it.field)
        .map((v) => v.soort),
    });
  }
  const echte = [...perCel.values()];

  // ── tegenproef-cellen: door de poort geweerde onderdelen ──────────────────
  // Die staan niet in enrichment_items (ze zijn immers geweerd), dus we herberekenen ze uit de
  // productnamen van dit merk met exact dezelfde functies als de poort gebruikt.
  const tegenproef: Cel[] = [];
  if (tegenproefN > 0) {
    const { products, brands } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { FIELDS } = await import("@/lib/enrichment/parser");
    const { ONDERDRUKKENDE_VERDENKINGEN } = await import("@/lib/repo/enrichment");
    const prods = await db
      .select({ name: products.name })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .where(eq(brands.name, run.brandName));
    const veld = items[0].field;
    const kandidaten: { naam: string; waarde: string }[] = [];
    for (const p of prods) {
      const specs = parseProductName(p.name);
      const v = specs[veld as (typeof FIELDS)[number]];
      if (v === undefined) continue;
      const vl = verdenkingen(p.name, specs);
      const blok = vl.find((x) => x.veld === veld && x.soort === "product-is-onderdeel");
      if (!blok) continue;
      kandidaten.push({ naam: p.name, waarde: String(v) });
    }
    // Gelijkmatig over de lijst, zodat het niet één productfamilie is.
    for (let i = 0; i < Math.min(tegenproefN, kandidaten.length); i++) {
      const k = kandidaten[Math.floor((i * kandidaten.length) / Math.min(tegenproefN, kandidaten.length))];
      tegenproef.push({
        celId: `t${String(i + 1).padStart(4, "0")}`,
        veld,
        waarde: k.waarde,
        naamvorm: fragmentVorm(k.naam, veld),
        aantalProducten: 1,
        productnamen: [k.naam],
        vlaggen: [],
      });
    }
  }

  // ── vallen ────────────────────────────────────────────────────────────────
  // Eén val per 20 echte cellen, minimaal 2. Een val is een ECHTE productnaam gekoppeld aan een
  // waarde die er aantoonbaar NIET in staat. Het juiste antwoord is dus 'nee-niet-in-naam'.
  // Bewust geen verzonnen namen: dan zou een agent de val aan de vorm kunnen herkennen.
  const aantalVallen = Math.max(2, Math.floor(echte.length / 20));
  const vallen: Cel[] = [];
  for (let i = 0; i < aantalVallen; i++) {
    const bron = echte[Math.floor((i * echte.length) / aantalVallen)];
    const echteWaarde = Number(bron.waarde);
    // Een waarde die gegarandeerd niet in deze naam voorkomt.
    let nep = String(Number.isFinite(echteWaarde) ? echteWaarde + 7 : "999");
    if (bron.productnamen.some((n) => n.replace(/\s+/g, "").includes(nep))) nep += "3";
    vallen.push({
      ...bron,
      celId: `v${String(i + 1).padStart(4, "0")}`,
      waarde: nep,
      val: true,
    });
  }

  // Vallen tussen de echte cellen mengen, deterministisch (elke n-de plek).
  const alles: Cel[] = [];
  const extra = [...vallen, ...tegenproef];
  const stap = Math.max(1, Math.floor(echte.length / (extra.length + 1)));
  let vi = 0;
  echte.forEach((c, i) => {
    alles.push(c);
    if ((i + 1) % stap === 0 && vi < extra.length) alles.push(extra[vi++]);
  });
  while (vi < extra.length) alles.push(extra[vi++]);

  // ── scherven schrijven ────────────────────────────────────────────────────
  const map = `zwerm/${runId}`;
  await mkdir(map, { recursive: true });
  const scherven: string[] = [];
  const antwoordsleutel: Record<string, { val: boolean; tegenproef: boolean; namen: string[] }> = {};

  for (let s = 0; s * scherfMaat < alles.length; s++) {
    const deel = alles.slice(s * scherfMaat, (s + 1) * scherfMaat);
    // Het scherfbestand draagt GEEN val-markering — anders is de val geen val.
    const cellen = deel.map(({ val: _val, ...c }) => c);
    const hash = createHash("sha256")
      .update(cellen.map((c) => `${c.celId}:${c.veld}:${c.waarde}`).join("|"))
      .digest("hex")
      .slice(0, 16);
    const pad = `${map}/scherf-${String(s + 1).padStart(2, "0")}.json`;
    await writeFile(
      pad,
      JSON.stringify(
        {
          meta: {
            runId,
            merk: run.brandName,
            scherf: s + 1,
            aantalCellen: cellen.length,
            manifestHash: hash,
            vraag:
              "Beschrijft deze waarde het ARMATUUR, en staat hij letterlijk in de productnaam? " +
              "Let op driver, converter, lamp, optiek, accessoire en bereiken.",
          },
          cellen,
        },
        null,
        2,
      ),
    );
    scherven.push(pad);
    for (const c of deel)
      antwoordsleutel[c.celId] = {
        val: c.val === true,
        tegenproef: c.celId.startsWith("t"),
        namen: c.productnamen,
      };
  }

  await writeFile(`${map}/antwoordsleutel.json`, JSON.stringify(antwoordsleutel, null, 2));

  console.log(`\nrun ${runId} — ${run.brandName}`);
  console.log(`  voorstellen : ${items.length}`);
  console.log(`  cellen      : ${echte.length} echt + ${vallen.length} vallen + ${tegenproef.length} tegenproef = ${alles.length}`);
  console.log(`  scherven    : ${scherven.length} (max ${scherfMaat} cellen elk)`);
  console.log(`  map         : ${map}/`);
  console.log(`\nde antwoordsleutel is voor de LEZER, niet voor de agents:`);
  console.log(`  ${map}/antwoordsleutel.json`);
  for (const p of scherven) console.log(`  ${p}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
