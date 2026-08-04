// De beoordeelblokken voor Timo, gegroepeerd op LEESREGEL in plaats van op naamvorm.
//
// Waarom niet op nameShape: die groepeert op hoe de naam eruitziet, en dan valt één leesregel
// uiteen over honderden vormen. De vraag die beoordeeld moet worden is niet "klopt deze naam"
// maar "klopt deze REGEL" — en een regel die fout is, is fout voor zijn hele blok. Zo staat er
// onder elk oordeel een getal dat zegt hoeveel producten eraan hangen.
//
//   bun --env-file=.env.branch scripts/toon-flos-leesregels.ts <runId>
import { assertBranchDb, logGuard } from "./branch-guard";

// De leesregels, in de volgorde waarin de parser ze toepast. `herkent` krijgt de naam en het
// veld, en zegt of DEZE regel de waarde voortbracht.
const REGELS: { veld: "kelvin" | "cri"; naam: string; uitleg: string; test: RegExp }[] = [
  {
    veld: "kelvin", naam: "K1 · twee cijfers × 100, met C erachter",
    uitleg: "'30KC90' en '35K C90' → 3000 K resp. 3500 K",
    test: /(?<![\d.,])\d{2}K\s?C\d{2}(?!\d)/,
  },
  {
    veld: "kelvin", naam: "K2 · één cijfer × 1000, met C erachter",
    uitleg: "'3K C90' → 3000 K; Flos schrijft dezelfde waarde in twee schalen",
    test: /(?<![\d.,])\dK\s?C\d{2}(?!\d)/,
  },
  {
    veld: "kelvin", naam: "K3 · CRI vastgeplakt zonder C",
    uitleg: "'30K90HC', '22K90 CB' → de twee cijfers ná de K zijn de CRI, niet de kelvin",
    test: /(?<![\d.,])\d{1,2}K\d{2}(?!\d)/,
  },
  {
    veld: "kelvin", naam: "K4 · kale vorm, geen CRI erachter",
    uitleg: "'… POWER LED 27K' → alleen kelvin; komt vooral door de afkapping op 40 tekens",
    test: /(?<![\d.,])\d{1,2}K(?![A-Za-z0-9])/,
  },
  {
    veld: "cri", naam: "C1 · C vast aan de K-code",
    uitleg: "'30KC90' → CRI 90",
    test: /(?<![\d.,])\d{1,2}KC\d{2}(?!\d)/,
  },
  {
    veld: "cri", naam: "C2 · C los ná de K-code",
    uitleg: "'35K C90', '30K C98' → CRI 90 resp. 98",
    test: /(?<![\d.,])\d{1,2}K\sC\d{2}(?!\d)/,
  },
  {
    veld: "cri", naam: "C3 · zonder C, vastgeplakt achter de kelvin",
    uitleg: "'40K98HC' → CRI 98; HC is géén CRI-aanduiding (312× met 90, 312× met 98)",
    test: /(?<![\d.,])\d{1,2}K\d{2}(?!\d)/,
  },
  {
    veld: "cri", naam: "C4 · losse C zonder K ervoor",
    uitleg: "'… LED ARR C80 3000K', '… LED ARRAY C95 13W' → CRI 80 resp. 95",
    test: /(?<![A-Za-z0-9])C\d{2}(?!\d)/,
  },
];

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const runId = process.argv[2];
  if (!runId) throw new Error("gebruik: toon-flos-leesregels.ts <runId>");
  const { db } = await import("@/db/client");
  const { getRunItems } = await import("@/lib/repo/enrichment");
  const items = await getRunItems(db, runId);
  console.log(`run ${runId} — ${items.length} voorstellen\n${"═".repeat(74)}`);

  // Elk voorstel valt in de EERSTE regel die past, zodat de blokken elkaar niet overlappen en
  // de aantallen optellen tot het totaal.
  const bak = new Map<string, { veld: string; uitleg: string; rijen: { naam: string; waarde: string }[]; waarden: Map<string, number> }>();
  const rest: { naam: string; veld: string; waarde: string }[] = [];
  for (const it of items) {
    const regel = REGELS.find((r) => r.veld === it.field && r.test.test(it.productName));
    if (!regel) { rest.push({ naam: it.productName, veld: it.field, waarde: it.value }); continue; }
    if (!bak.has(regel.naam)) bak.set(regel.naam, { veld: regel.veld, uitleg: regel.uitleg, rijen: [], waarden: new Map() });
    const b = bak.get(regel.naam)!;
    b.rijen.push({ naam: it.productName, waarde: it.value });
    b.waarden.set(it.value, (b.waarden.get(it.value) ?? 0) + 1);
  }

  for (const regel of REGELS) {
    const b = bak.get(regel.naam);
    if (!b) continue;
    console.log(`\n${regel.naam}`);
    console.log(`   ${b.uitleg}`);
    console.log(`   ${b.rijen.length} voorstellen · veld ${b.veld} · waarden: ${[...b.waarden].sort((a, x) => x[1] - a[1]).map(([w, n]) => `${w} (${n}×)`).join(", ")}`);
    console.log();
    // Vier ECHTE namen, gespreid over de blok-inhoud in plaats van de eerste vier op een rij —
    // die zijn bij Flos altijd kleurvarianten van hetzelfde artikel en tonen dus niets.
    const stap = Math.max(1, Math.floor(b.rijen.length / 4));
    for (let i = 0, n = 0; i < b.rijen.length && n < 4; i += stap, n++) {
      const r = b.rijen[i];
      console.log(`     ${r.naam}  →  ${b.veld} wordt ${r.waarde}`);
    }
  }

  if (rest.length) {
    console.log(`\n⚠️  ${rest.length} voorstellen vielen in GEEN leesregel — die horen er niet te zijn:`);
    for (const r of rest.slice(0, 12)) console.log(`     ${r.naam} → ${r.veld} wordt ${r.waarde}`);
  } else {
    console.log(`\n✓ elk van de ${items.length} voorstellen valt in precies één leesregel`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
