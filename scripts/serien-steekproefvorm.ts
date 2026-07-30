// Wat doet de BESTAANDE steekproefpoort met een KOLOM-bron?
//
// pickSampleIndices stratificeert op `field|nameShape(productName)`
// (lib/repo/enrichment.ts:94). Bij de naam-route is dat precies goed: de naam bevat de waarde,
// dus een nieuwe naamvorm is een nieuw leespatroon. Bij een kolom-bron staat de waarde NIET in
// de naam — de naam is dan geen signaal over de waarde maar ruis.
//
// Dit script laat dat structureel zien met de échte Serien-namen uit de import-bron en de
// échte pickSampleIndices. De waarden zijn stand-ins (de rauwe Serien-kolommen zitten niet in
// de CSV-export, zie het probleemdoc) — daarom meet dit uitsluitend de STRUCTUUR van de
// steekproef: over hoeveel naamvormen hij spreidt, en hoeveel distincte waardevormen hij
// daarmee te zien krijgt. De verdeling van de stand-ins komt uit de sprintmaster-meting op
// `CCT K` en is als zodanig gelabeld.
//
// Geen database, dus geen branch-poort. Draaien: bun scripts/serien-steekproefvorm.ts

import { readFileSync } from "node:fs";
import { iterRecords } from "./csv";
import { nameShape, pickSampleIndices } from "../lib/repo/enrichment";

const CSV = "/Users/timowittkamp/Documents/dev/lumenlogic/data/source/brink_products.csv";

// Sprintmaster-meting op Serien's rauwe `CCT K` (1.955 rijen). De drie bruikbare waarden en
// de vier plaatshouders/bereiken; alleen de bruikbare zouden in stap 1 een voorstel worden.
const CCT_VERDELING: [string, number][] = [
  ["2700", 540],
  ["3000", 531],
  ["4000", 212],
];
const NIET_BRUIKBAAR: [string, number][] = [
  ["-", 237],
  ["OHNE LM", 70],
  ["TUNABLE WHITE 2200-5000", 44],
  ["LM", 24],
];

function main(): void {
  const namen: string[] = [];
  for (const r of iterRecords(readFileSync(CSV, "utf8"))) {
    if (!r.id || !r.name) continue;
    if ((r.brand_name ?? "").toLowerCase().includes("serien")) namen.push(r.name);
  }
  namen.sort(); // startEnrichmentRun sorteert op naam (enrichment.ts:194)

  const vormen = new Set(namen.map(nameShape));
  console.log(`\nSerien: ${namen.length} producten · ${vormen.size} distincte naamvormen`);

  // Bouw de voorstellen zoals een kolom-run ze zou maken: alleen de bruikbare waarden, in
  // naamvolgorde, cyclisch verdeeld over de producten (stand-in — de echte koppeling
  // product↔waarde kennen we niet).
  const bruikbaar = CCT_VERDELING.flatMap(([v, n]) => Array<string>(n).fill(v));
  const voorstellen = bruikbaar.map((value, i) => ({
    productId: `p${i}`,
    productName: namen[i % namen.length],
    field: "kelvin",
    value,
  }));
  console.log(
    `Voorstellen (alleen bruikbare CCT K): ${voorstellen.length} · ` +
      `overgeslagen plaatshouders/bereiken: ${NIET_BRUIKBAAR.reduce((a, [, n]) => a + n, 0)}`,
  );

  const sample = pickSampleIndices(voorstellen);
  const gezieneVormen = new Set<string>();
  const gezieneWaarden = new Map<string, number>();
  for (const i of sample) {
    gezieneVormen.add(nameShape(voorstellen[i].productName));
    const v = voorstellen[i].value;
    gezieneWaarden.set(v, (gezieneWaarden.get(v) ?? 0) + 1);
  }

  console.log(`\nSteekproef: ${sample.size} rijen`);
  console.log(`  distincte naamvormen erin : ${gezieneVormen.size}`);
  console.log(
    `  distincte WAARDEN erin    : ${gezieneWaarden.size} — ` +
      [...gezieneWaarden.entries()].map(([v, n]) => `${v} (${n}×)`).join(" · "),
  );
  console.log(
    `  waarden in de populatie   : ${CCT_VERDELING.length} bruikbaar + ` +
      `${NIET_BRUIKBAAR.length} plaatshouder/bereik-vormen`,
  );

  // De kernvraag: kan de beoordelaar de waarde aan de naam toetsen? Alleen als de naam een
  // getal draagt dat op een kelvin lijkt. Gemeten over de hele steekproef.
  const metKelvinInNaam = [...sample].filter((i) =>
    /\b\d{4}\s*K\b/i.test(voorstellen[i].productName),
  ).length;
  console.log(
    `\n  steekproefrijen waarvan de naam de waarde bevestigt: ${metKelvinInNaam}/${sample.size}`,
  );
  console.log(`  voorbeeld zoals de beoordelaar hem ziet (naam · veld · waarde):`);
  for (const i of [...sample].slice(0, 5)) {
    console.log(
      `    "${voorstellen[i].productName}" · kelvin · ${voorstellen[i].value}`,
    );
  }
  console.log();
}

main();
