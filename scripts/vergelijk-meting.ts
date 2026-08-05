// Nulmeting tegen nameting, met de voorspellingen als expliciete toets.
//
//   bun scripts/vergelijk-meting.ts <nulmeting.json> <nameting.json>
//
// Geen database, geen guard nodig: het leest twee uitdraaien van scripts/eval-testset.ts --json.
//
// WAAROM DIT EEN SCRIPT IS. Twee JSON's van 47 KB met de hand vergelijken is precies waar een
// meting sneuvelt — je ziet wat je verwacht. De drie voorspellingen uit
// docs/plan-lege-speckolommen-xal.md staan hieronder als code, zodat ze fout kúnnen gaan:
//
//   1. tno staat STIL. Het heeft wél vier XAL-regels (Lr302–Lr305, alle 'open' met een XAL
//      top-1), maar geen enkele tno-regel vraagt om CRI. Dan telt cri niet mee in
//      judgeCandidate en niet in specScoreSql — noch de beoordeling, noch de sortering mag
//      veranderen. Juist omdát er XAL-kandidaten zijn, is stilstand een echte toets en geen
//      triviale. Beweegt het toch: STOP.
//   2. Alleen VIER raadhuis-regels kunnen bewegen: Lr301 (geel, rang 1), Lr303 (geel, rang 1),
//      Lw001 (open, rang 2) en Lw002 (geel, rang 2). De overige 27 zijn Bega, Exenia, Etap of
//      merkloos; die raakt een XAL-vulling niet, hoeveel CRI ze ook vragen. rang≤50 staat al
//      op 4/4 en top-1 op 2/4 — die mogen niet omlaag.
//   3. Rood is bij die vier NIET de verwachting: ze vragen alle CRI≥90 en XAL draagt 90, 95,
//      97 of 98. Rood kan alleen als de best passende kandidaat CRI80 blijkt te dragen — dan
//      is het 'eerlijker geworden' en moet het als zodanig worden vastgelegd, niet weggepoetst.
//
// EERDER FOUT GEDACHT, hier vastgelegd zodat het niet terugkomt: ik voorspelde dat Lr302 rood
// zou worden omdat die CRI≥92 vraagt terwijl XAL 90 levert. Lr302 is een EXENIA-regel en staat
// op 'blauw' (dat merk is niet ingeladen). Ik nam aan dat de hele Lr3xx-serie XAL was omdat
// Lr301 en Lr303 dat zijn. Een XAL-vulling raakt Lr302 niet.
//
// Let op het verschil tussen de twee populaties (zie docs/probleem-lege-speckolommen-xal.md):
// de eval meet de VERSE PARSE — raadhuis 31 regels, tno 15. De opgeslagen spec_lines zijn er
// 42 en 20; die bewegen bij de hermatch maar verschijnen niet in deze vergelijking.
//
// ⚠️ ARMATUURCODES ZIJN NIET UNIEK OVER DOSSIERS. `Lr302` is in raadhuis een EXENIA-regel en in
// tno een XAL-regel — zelfde code, ander dossier, ander merk. Deze vergelijking indexeert daarom
// per case én per code; een lookup op code alleen mengt projecten door elkaar. Dat is hier al
// twee keer misgegaan: een spec_lines-telling die op fixtureCode filterde nam tien dossiers mee
// (76 'tno-regels' in plaats van 20), en de eerste Lr302-voorspelling verwisselde de twee.

import { readFile } from "node:fs/promises";

type Regel = {
  code: string;
  gelezen: boolean;
  status: string | null;
  rang: number | null;
  top1: boolean | null;
  top1Code: string | null;
};
type Case = { key: string; regels: Regel[]; import?: unknown; status?: unknown };

// Bruikbaarheid van beste naar slechtste. 'open' is niet per se erger dan 'rood' — open zegt
// "onvolledige data", rood zegt "aantoonbaar verkeerde waarde" — maar voor een spec-regel die
// een mens moet oplossen is groen > geel > open > rood.
const RANGORDE = ["groen", "geel", "open", "blauw", "rood", "paars"];
const beter = (a: string | null, b: string | null) => {
  const ia = a ? RANGORDE.indexOf(a) : 99;
  const ib = b ? RANGORDE.indexOf(b) : 99;
  return ia - ib; // negatief = a is beter
};

// De enige regels die door een XAL CRI-vulling kúnnen bewegen: merk XAL én een CRI-eis.
// Alles buiten deze verzameling dat tóch verandert, is per definitie onverklaard.
const KAN_BEWEGEN: Record<string, string[]> = {
  raadhuis: ["Lr301", "Lr303", "Lw001", "Lw002"],
  tno: [], // vier XAL-regels, maar geen CRI-eis → mag niets veranderen
};

async function lees(pad: string): Promise<Map<string, Case>> {
  const j = JSON.parse(await readFile(pad, "utf8"));
  return new Map((j.results as Case[]).map((c) => [c.key, c]));
}

async function main() {
  const [, , nulPad, naPad] = process.argv;
  if (!nulPad || !naPad) throw new Error("gebruik: vergelijk-meting.ts <nulmeting.json> <nameting.json>");
  const nul = await lees(nulPad);
  const na = await lees(naPad);

  let stops = 0;
  let teVerklaren = 0;

  for (const [key, voor] of nul) {
    const naCase = na.get(key);
    if (!naCase) {
      console.log(`\n══ ${key}: ONTBREEKT in de nameting ══`);
      stops++;
      continue;
    }
    const voorRegels = new Map(voor.regels.map((r) => [r.code, r]));
    const naRegels = new Map(naCase.regels.map((r) => [r.code, r]));

    const wijzigingen: string[] = [];
    for (const [code, v] of voorRegels) {
      const n = naRegels.get(code);
      if (!n) {
        wijzigingen.push(`  ${code}: regel VERDWENEN uit de nameting`);
        stops++;
        continue;
      }
      const statusAnders = v.status !== n.status;
      const rangAnders = v.rang !== n.rang;
      const top1Anders = v.top1Code !== n.top1Code;
      if (!statusAnders && !rangAnders && !top1Anders) continue;

      // Een regel die niet in KAN_BEWEGEN staat, hoort per constructie stil te staan: geen
      // XAL-merk of geen CRI-eis. Beweegt hij toch, dan klopt de aanname of de keten niet.
      const mocht = (KAN_BEWEGEN[key] ?? []).includes(code);
      if (!mocht) {
        wijzigingen.push(`  ${code}: ⚠️  VERANDERT TERWIJL DAT NIET KAN — geen XAL-merk of geen CRI-eis`);
        stops++;
      }

      const delen: string[] = [];
      if (statusAnders) {
        const richting = beter(v.status, n.status);
        const label =
          richting < 0
            ? n.status === "rood"
              ? "naar ROOD — eerlijker of regressie? verklaren met de deviations"
              : "VERSLECHTERD"
            : "verbeterd";
        delen.push(`status ${v.status} → ${n.status} [${label}]`);
        if (richting < 0) teVerklaren++;
      }
      if (rangAnders) {
        const slechter = (n.rang ?? 999) > (v.rang ?? 999);
        delen.push(`rang ${v.rang ?? "–"} → ${n.rang ?? "–"}${slechter ? " [SLECHTER]" : ""}`);
        if (slechter) teVerklaren++;
      }
      if (top1Anders) delen.push(`top-1 ${v.top1Code ?? "–"} → ${n.top1Code ?? "–"}`);
      wijzigingen.push(`  ${code}: ${delen.join(" · ")}`);
    }

    console.log(`\n══ ${key} — ${wijzigingen.length} regel(s) veranderd van ${voor.regels.length} ══`);
    for (const w of wijzigingen) console.log(w);

    // Voorspelling 1: tno is de controlegroep en moet exact stilstaan.
    if (key === "tno") {
      if (wijzigingen.length === 0) {
        console.log("  ✓ CONTROLEGROEP INTACT — tno vraagt geen CRI en staat stil, zoals voorspeld");
      } else {
        console.log(
          "  ✗ STOP — tno beweegt terwijl geen enkele tno-regel in de verse parse om CRI vraagt.\n" +
            "    Dat kan niet aan de CRI-vulling liggen; de meetketen of de aanname deugt niet.",
        );
        stops++;
      }
    }
  }

  // De vier raadhuis-regels die wél kunnen bewegen, expliciet naast elkaar.
  console.log(`\n── de vier XAL-regels in raadhuis (de enige met CRI-eis én XAL-merk) ──`);
  for (const code of KAN_BEWEGEN.raadhuis) {
    const v = nul.get("raadhuis")?.regels.find((r) => r.code === code);
    const n = na.get("raadhuis")?.regels.find((r) => r.code === code);
    console.log(
      `  ${code.padEnd(7)} ${String(v?.status).padEnd(6)} → ${String(n?.status).padEnd(6)}` +
        `   rang ${v?.rang ?? "–"} → ${n?.rang ?? "–"}`,
    );
  }

  console.log(`\n── uitkomst ──`);
  console.log(`  stops        : ${stops}`);
  console.log(`  te verklaren : ${teVerklaren}`);
  console.log(
    stops > 0
      ? "\n✗ STOP. Niet publiceren naar productie; eerst de oorzaak vinden.\n"
      : teVerklaren > 0
        ? "\n⚠️  Geen harde stop, maar er zijn onverklaarde verslechteringen. Elk geval terugvoeren\n" +
          "   op een oorzaak en indelen als 'fout ingelezen' (regressie) of 'eerlijker geworden'.\n"
        : "\n✓ Geen regressie en geen onverklaarde beweging.\n",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
