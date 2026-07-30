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
import { meng } from "@/lib/enrichment/zwerm-meng";

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
// Pad naar het promptbestand dat de agents krijgen. De HASH daarvan gaat in elke scherf, en de
// verwerker weigert antwoorden waarvan de echo niet klopt.
//
// Waarom dit een slot moet zijn en geen discipline: op 30 jul draaide ik scherf 6 opnieuw met
// een AANGESCHERPTE prompt ("let scherp op een decimale typemaat…", "een losse lamp of
// LED-module") en het tweede antwoord week precies op die twee punten af. Ik meldde die
// afwijking als onenigheid tússen agents — als signaal dat er een echte productvraag lag —
// terwijl ik er zelf aan geduwd had. Dat is het verschil tussen een meting en een bevestiging
// van je eigen vermoeden, en je ziet die fout niet terwijl je hem maakt.
const promptPad = rest.find((a) => a.startsWith("--prompt="))?.slice(9) ?? null;

// De vorm van het spec-fragment: de karakters die dit veld voortbrachten, plus context —
// UITGEBREID TOT WOORDGRENZEN.
//
// Waarom die uitbreiding: een venster op een vast aantal tekens knipt midden in een woord, en
// dan splitst dezelfde vorm in tweeën zodra een buurwoord één teken langer is. Gezien in de
// uitdraai van de Flos-cri-run: "BON JOUR 145 BLACK LED ARRAY 27K CRI90" gaf `ray #k cri#` en
// "… ARRAY 3K CRI90" gaf `rray #k cri#`, omdat "27K" één teken langer is dan "3K". Twee cellen
// voor precies dezelfde vraag. Dat is ruis van de knip, geen verschil in de data — en het
// verklaarde waarom die run 11 cellen gaf waar de hele naam er 10 gaf.
function fragmentVorm(naam: string, veld: string): string {
  const spans = specSpans(naam)
    .filter((s) => s.field === veld)
    .sort((a, b) => a.start - b.start);
  const s = spans[0];
  if (!s) return nameShape(naam);
  let van = Math.max(0, s.start - CONTEXT);
  let tot = Math.min(naam.length, s.end + CONTEXT);
  // naar buiten tot een spatie (of het begin/eind van de naam)
  while (van > 0 && !/\s/.test(naam[van - 1])) van--;
  while (tot < naam.length && !/\s/.test(naam[tot])) tot++;
  return nameShape(naam.slice(van, tot));
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
      celId: `x${String(perCel.size + 1).padStart(4, "0")}`, // voorlopig; hernummerd na het mengen
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
        celId: `t${String(i + 1).padStart(4, "0")}`, // voorlopig
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
  // Minstens één val per scherf, en minstens één per 20 echte cellen — zodat val-recall een
  // uitspraak is over ÉLKE scherf en niet alleen over de scherven die er toevallig een kregen.
  // (Gezien in ronde 2: scherf 7 had wel tegenproef-cellen maar geen enkele val.)
  const nodigPerScherf = Math.ceil(echte.length / scherfMaat);
  const aantalVallen = Math.max(2, nodigPerScherf, Math.floor(echte.length / 20));
  const vallen: Cel[] = [];
  for (let i = 0; i < aantalVallen; i++) {
    const bron = echte[Math.floor((i * echte.length) / aantalVallen)];
    const echteWaarde = Number(bron.waarde);
    // ── De VORM van de vervalsing varieert (30 jul) ─────────────────────────
    // Eerst was elke val `waarde + 7`. Twee agenten meldden dat ze de vallen herkenden, en
    // hoewel ze dat aan het celId-voorvoegsel toeschreven, was er een tweede spoor: vier
    // agenten "verklaarden" de vallen als een parserfout die een 7 aan de kelvin plakt. Een
    // val met een vaste transformatie is dus aan zijn INHOUD te herkennen, en dan meet de
    // recall of de agent het patroon doorhad in plaats van of hij de cel las.
    let nep: string;
    if (!Number.isFinite(echteWaarde)) {
      nep = "999";
    } else if (i % 3 === 0) {
      nep = String(echteWaarde + 7); // optellen
    } else if (i % 3 === 1) {
      // cijfers omdraaien: 2700 → 0072 → 72; bij korte waarden een ander getal uit de reeks
      const om = String(echteWaarde).split("").reverse().join("").replace(/^0+/, "");
      nep = om && om !== String(echteWaarde) ? om : String(Math.round(echteWaarde * 1.5));
    } else {
      // de waarde van een ANDERE cel met hetzelfde veld — het meest natuurlijke bedrog
      const zelfdeVeld = echte.filter((c) => c.veld === bron.veld && c.waarde !== bron.waarde);
      nep = zelfdeVeld.length
        ? zelfdeVeld[Math.floor((i * zelfdeVeld.length) / aantalVallen) % zelfdeVeld.length].waarde
        : String(echteWaarde + 3);
    }
    if (bron.productnamen.some((n) => n.replace(/\s+/g, "").includes(nep))) nep += "3";
    vallen.push({
      ...bron,
      celId: `v${String(i + 1).padStart(4, "0")}`, // voorlopig
      waarde: nep,
      val: true,
    });
  }

  // Vallen en tegenproef tussen de echte cellen mengen — deterministisch, maar niet op een
  // vaste stap (zie `meng()`).
  const alles: Cel[] = [];
  // Vallen en tegenproef-cellen AFWISSELEND invoegen. Achter elkaar plakken liet ze clusteren:
  // in ronde 2 kregen de scherven 1–5 alleen vallen en scherf 7 alleen tegenproef-cellen, en
  // dan is "val-recall 86/86" een uitspraak over de scherven die er een hadden.
  // Er zijn veel meer vallen dan tegenproef-cellen, dus simpel afwisselen laat de tegenproef
  // aan het begin opraken en clustert hem in de eerste scherven. Zet de tegenproef-cellen op
  // gelijkmatig gespreide posities in de gecombineerde lijst.
  const extra: Cel[] = [...vallen];
  tegenproef.forEach((t, i) => {
    const pos = Math.min(
      extra.length,
      Math.round(((i + 0.5) * (vallen.length + tegenproef.length)) / Math.max(1, tegenproef.length)),
    );
    extra.splice(pos, 0, t);
  });
  // De invoegposities komen uit `meng()` (lib/enrichment/zwerm-meng.ts): hash-gestuurd binnen
  // gelijke emmers, dus gespreid maar niet op een vaste stap. Los getest.
  alles.push(
    ...meng(echte, extra, (s) => createHash("sha256").update(s).digest()),
  );

  // ── celId's hernummeren: geen herkenbaar voorvoegsel meer ─────────────────
  // Twee agenten meldden onafhankelijk dat ze de ingevoegde cellen aan hun `v`- en `t`-prefix
  // konden zien ("alle 16 zitten in v-cellen, geen enkele c-cel"). Hun oordelen verwezen
  // inhoudelijk naar de productnaam, dus de uitslag stond er niet door onder druk — maar een
  // val die je kunt hérkennen is geen val, en dan meet de recall alleen nog of de agent het
  // patroon doorhad. Doorlopend hernummeren in de gemengde volgorde; de antwoordsleutel houdt
  // bij wat wat was, en die krijgen de agents niet.
  const soortVan = new Map<string, "echt" | "val" | "tegenproef">();
  alles.forEach((c, i) => {
    soortVan.set(
      `${i}`,
      c.val === true ? "val" : c.celId.startsWith("t") ? "tegenproef" : "echt",
    );
    c.celId = `c${String(i + 1).padStart(4, "0")}`;
  });

  // ── scherven schrijven ────────────────────────────────────────────────────
  const map = `zwerm/${runId}`;
  await mkdir(map, { recursive: true });

  // De prompt hoort bij het manifest: verandert hij, dan zijn oude antwoorden niet meer
  // vergelijkbaar met nieuwe en mogen ze niet worden samengevoegd.
  let promptHash = "geen-prompt-vastgelegd";
  if (promptPad) {
    const { readFile } = await import("node:fs/promises");
    const tekst = await readFile(promptPad, "utf8");
    promptHash = createHash("sha256").update(tekst).digest("hex").slice(0, 16);
    await writeFile(`${map}/prompt.md`, tekst);
  }
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
            // Neem deze letterlijk over in je antwoord. Wijkt hij af, dan is je antwoord onder
            // een andere vraagstelling tot stand gekomen en telt het niet mee.
            promptHash,
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
    deel.forEach((c, j) => {
      const soort = soortVan.get(`${s * scherfMaat + j}`);
      antwoordsleutel[c.celId] = {
        val: soort === "val",
        tegenproef: soort === "tegenproef",
        namen: c.productnamen,
      };
    });
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
