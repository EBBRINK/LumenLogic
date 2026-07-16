// Meetinstrument (stap 0 van docs/goal-import-ai-leesroute.md): haalt de vier echte
// testcases door het EXACTE productiecodepad en meet ze tegen de grondwaarheid
// (scripts/eval/grondwaarheid.ts). Draaien:
//
//   bun --env-file=.env.local scripts/eval-testset.ts [flags]
//
// Flags:
//   --json               machine-leesbaar volledig resultaatobject naar stdout
//   --case=<key>         alleen raadhuis|kvk|tno|dordrecht
//   --rank-limit=<n>     kandidaten-limiet voor de rang-meting (default 50)
//   --assert-nulmeting   toets de nulmeting van 16 jul; exit 1 bij elke afwijking
//   --ai                 OCR/AI-route (nog niet gebouwd — wordt eerlijk gemeld)
//
// ── CONTRACT: STRIKT READ-ONLY ───────────────────────────────────────────────
// Dit script schrijft NIETS. Het importeert bewust géén runMatcher, logEvent,
// addSpecLines of enige andere functie die insert/update/delete doet. Het enige
// DB-verkeer is evaluateSpecLine (lib/matching/engine.ts) — die doet uitsluitend
// selects — plus één `select name from brands` en één pg_trgm-smoke-select.
// De testset-PDF's zijn echte klantdata: dit script LEEST ze alleen (EVAL_DIR,
// default ~/Downloads/lumenlogic-testset) en ze komen nooit in git.
// ─────────────────────────────────────────────────────────────────────────────
//
// Codepad per case (identiek aan de import-action, app/projects/actions.ts):
//   fs.readFile → extractPagesFromPdf → parseSpecLinesFromPages(pages, brandNames)
//   → per regel SpecRequest (specRequestFromLine-vorm) → evaluateSpecLine(db, req)
//   met de DEFAULT limit voor de statuskolom; voor gemapte regels een tweede call
//   met { limit: rankLimit } voor de rang van Jayden's artikelcode.

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import type { SpecLineInput } from "@/lib/repo/dossiers";
import {
  brandKeyOf,
  evaluateSpecLine,
  type MatchOutcome,
  type ScoredCandidate,
  type SpecRequest,
} from "@/lib/matching/engine";
import { normalizeSku } from "@/lib/matching/tolerances";
import {
  GRONDWAARHEID,
  type GrondwaarheidCase,
} from "./eval/grondwaarheid";

// ── flags ────────────────────────────────────────────────────────────────────

type Flags = {
  json: boolean;
  caseKey: string | null;
  rankLimit: number;
  assertNulmeting: boolean;
  ai: boolean;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    json: false,
    caseKey: null,
    rankLimit: 50,
    assertNulmeting: false,
    ai: false,
  };
  for (const arg of argv) {
    if (arg === "--json") flags.json = true;
    else if (arg === "--assert-nulmeting") flags.assertNulmeting = true;
    else if (arg === "--ai") flags.ai = true;
    else if (arg.startsWith("--case=")) {
      const v = arg.slice("--case=".length);
      if (!GRONDWAARHEID.some((c) => c.key === v)) {
        console.error(
          `Onbekende case '${v}' — kies uit: ${GRONDWAARHEID.map((c) => c.key).join("|")}`,
        );
        process.exit(1);
      }
      flags.caseKey = v;
    } else if (arg.startsWith("--rank-limit=")) {
      const n = Number(arg.slice("--rank-limit=".length));
      if (!Number.isInteger(n) || n < 1) {
        console.error(`Ongeldige --rank-limit '${arg}' — verwacht een positief geheel getal.`);
        process.exit(1);
      }
      flags.rankLimit = n;
    } else {
      console.error(`Onbekende flag '${arg}'.`);
      process.exit(1);
    }
  }
  return flags;
}

// ── artikelcode-vergelijking ─────────────────────────────────────────────────
// L-prefix-bevinding (read-only geverifieerd, 16 jul 2026): álle 210.117
// article_codes in visible_products beginnen met "L". Jayden's codes zoals
// "L3600482413537F" staan er letterlijk in als article_code "L360048-2413537F" —
// normalizeSku over article_code matcht dus direct, MÉT L-prefix.
// supplier_article_code is dezelfde code zónder het "L360…"-leveranciersprefix
// ("048-2413537F") en matcht niet, ook niet na L-strippen; bovendien draagt
// ScoredCandidate dat veld niet. We vergelijken daarom normalizeSku(articleCode)
// tegen de volledige én de L-gestripte Jayden-code (beide richtingen), zodat een
// eventueel prefix-loos gevoerde code ook telt. De zes Dordrecht-artikelcodes
// (Philips/Valerie Objects/Aromas/Ferm Living) staan in het geheel niet in
// products of visible_products — die rang blijft per definitie ">limit".
function candidateMatches(c: ScoredCandidate, artikelCodes: string[]): boolean {
  if (!c.articleCode) return false;
  const ac = normalizeSku(c.articleCode);
  return artikelCodes.some((j) => {
    const nj = normalizeSku(j);
    return ac === nj || ac === nj.replace(/^l/, "") || ac.replace(/^l/, "") === nj;
  });
}

// SpecRequest in exact de specRequestFromLine-vorm (lib/repo/matching.ts) — daar
// niet geïmporteerd omdat die module logEvent/runMatcher meebrengt en dit script
// contractueel niets uit de schrijvende repo-laag importeert. SpecLineInput draagt
// de req-velden al als number|null, dus de Number()-conversies van de DB-rij
// (numeric → string) zijn hier niet nodig.
function toSpecRequest(l: SpecLineInput): SpecRequest {
  return {
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    sku: null,
    specs: {
      kelvin: l.reqKelvin ?? null,
      cri: l.reqCri ?? null,
      ip: l.reqIp ?? null,
      watt: l.reqWatt ?? null,
      lumen: l.reqLumen ?? null,
      beamAngle: l.reqBeamAngle ?? null,
      sizeCm: l.reqSizeCm ?? null,
      shape: l.reqShape ?? null,
      color: l.reqColor ?? null,
      dimmable: l.reqDimmable ?? null,
    },
  };
}

// ── resultaatmodel ───────────────────────────────────────────────────────────

type MerkOordeel = "bestaand" | "fout" | "leeg";

type RegelResultaat = {
  code: string;
  gelezen: boolean;
  spook: boolean;
  merkText: string | null;
  merkOordeel: MerkOordeel | null;
  status: string | null;
  // rang van Jayden's artikelcode in [...provable, ...incomplete] (1-based) bij
  // limit=rankLimit; null = geen mapping; ">N" = niet gevonden binnen de limiet
  rang: number | string | null;
  autoKeuze: boolean | null; // B3: unambiguousYellow matcht Jayden
  top1: boolean | null; // informatief: provable[0] ?? incomplete[0] matcht
};

type CaseResultaat = {
  key: string;
  bron: string;
  hadText: boolean;
  tekstlaagVerwacht: boolean;
  melding: string | null;
  historischeNoot: string | null;
  import: {
    gelezen: number;
    verwacht: number;
    gemist: string[];
    spookcodes: string[];
  };
  merk: {
    bestaand: number;
    fout: number;
    leeg: number;
    gelezenTotaal: number;
    verwachtGoed: number;
    verwachtBekend: number;
  };
  status: Record<string, number>;
  keuze: {
    nvt: boolean;
    gemapt: number;
    inTopRank: number;
    autoGoed: number;
    top1Goed: number;
  };
  regels: RegelResultaat[];
  duurMs: number;
};

// ── merk-oordeel (in-process, één brands-fetch) ──────────────────────────────
// Drie emmers: "bestaand merk" (brandKeyOf ∈ brands én — waar verwacht bekend —
// gelijk aan het verwachte merk), "fout" (gevuld maar geen bestaand merk óf ≠
// verwacht-waar-bekend), "leeg" (null — eerlijk onbekend, GEEN fout).
function merkOordeel(
  brandText: string | null,
  verwachtMerk: string | undefined,
  brandKeySet: Set<string>,
): MerkOordeel {
  if (brandText == null || brandText.trim() === "") return "leeg";
  const key = brandKeyOf(brandText);
  if (!brandKeySet.has(key)) return "fout";
  if (verwachtMerk && key !== brandKeyOf(verwachtMerk)) return "fout";
  return "bestaand";
}

// ── één case meten ───────────────────────────────────────────────────────────

async function meetCase(
  c: GrondwaarheidCase,
  evalDir: string,
  brandNames: string[],
  brandKeySet: Set<string>,
  flags: Flags,
): Promise<CaseResultaat> {
  const t0 = performance.now();

  const pages: string[] = [];
  for (const rel of c.pdfPaden) {
    const bytes = await readFile(path.join(evalDir, ...rel.split("/")));
    pages.push(...(await extractPagesFromPdf(new Uint8Array(bytes))));
  }

  // het exacte productiecodepad (app/projects/actions.ts, importArmaturenboekPagesAction)
  const parsed = parseSpecLinesFromPages(pages, brandNames);

  let melding: string | null = null;
  if (!parsed.hadText) {
    melding = flags.ai
      ? "OCR/AI-route nog niet gebouwd — gepland voor bouwstap 2"
      : "geen tekstlaag; OCR-route overgeslagen (--ai)";
  }

  const codesSet = new Set(c.codes);
  const lineByCode = new Map<string, SpecLineInput>();
  for (const l of parsed.lines) lineByCode.set(l.fixtureCode, l);

  const status: Record<string, number> = {};
  const regels: RegelResultaat[] = [];
  const merk = { bestaand: 0, fout: 0, leeg: 0, gelezenTotaal: 0, verwachtGoed: 0, verwachtBekend: 0 };
  const keuze = { nvt: Object.keys(c.keuze).length === 0, gemapt: 0, inTopRank: 0, autoGoed: 0, top1Goed: 0 };

  let i = 0;
  for (const line of parsed.lines) {
    i++;
    const tLine = performance.now();
    const code = line.fixtureCode;
    const spook = !codesSet.has(code);
    const verwachtMerk = c.verwachtMerkPerCode[code];

    // statuskolom: het productiepad met de DEFAULT limit
    const req = toSpecRequest(line);
    const outcome = await evaluateSpecLine(db, req);
    status[outcome.status] = (status[outcome.status] ?? 0) + 1;

    // merk-oordeel
    const oordeel = merkOordeel(line.brandText ?? null, verwachtMerk, brandKeySet);
    merk[oordeel]++;
    merk.gelezenTotaal++;
    if (verwachtMerk) {
      merk.verwachtBekend++;
      if (
        line.brandText != null &&
        brandKeyOf(line.brandText) === brandKeyOf(verwachtMerk)
      ) {
        merk.verwachtGoed++;
      }
    }

    // rang + keuze, alleen voor regels mét Jayden-mapping (tweede call, ruimere limit)
    let rang: RegelResultaat["rang"] = null;
    let autoKeuze: boolean | null = null;
    let top1: boolean | null = null;
    const mapping = c.keuze[code];
    if (mapping) {
      keuze.gemapt++;
      const wide: MatchOutcome = await evaluateSpecLine(db, req, {
        limit: flags.rankLimit,
      });
      const kandidaten = [...wide.provable, ...wide.incomplete];
      const idx = kandidaten.findIndex((k) =>
        candidateMatches(k, mapping.artikelCodes),
      );
      rang = idx >= 0 ? idx + 1 : `>${flags.rankLimit}`;
      if (idx >= 0) keuze.inTopRank++;

      // auto-keuze (B3) en top-1 op de DEFAULT-outcome — dat is wat productie doet
      autoKeuze =
        outcome.unambiguousYellow != null &&
        candidateMatches(outcome.unambiguousYellow, mapping.artikelCodes);
      if (autoKeuze) keuze.autoGoed++;
      const top = outcome.provable[0] ?? outcome.incomplete[0];
      top1 = top != null && candidateMatches(top, mapping.artikelCodes);
      if (top1) keuze.top1Goed++;
    }

    regels.push({
      code,
      gelezen: true,
      spook,
      merkText: line.brandText ?? null,
      merkOordeel: oordeel,
      status: outcome.status,
      rang,
      autoKeuze,
      top1,
    });

    const dt = ((performance.now() - tLine) / 1000).toFixed(1);
    process.stderr.write(
      `[${c.key} ${i}/${parsed.lines.length}] ${code} → ${outcome.status}, ${dt}s\n`,
    );
  }

  // niet-gelezen verwachte codes als lege rijen erbij (voor de regel-tabel)
  const gelezenVerwacht = c.codes.filter((code) => lineByCode.has(code));
  const gemist = c.codes.filter((code) => !lineByCode.has(code));
  for (const code of gemist) {
    regels.push({
      code,
      gelezen: false,
      spook: false,
      merkText: null,
      merkOordeel: null,
      status: null,
      rang: null,
      autoKeuze: null,
      top1: null,
    });
  }
  const spookcodes = parsed.lines
    .map((l) => l.fixtureCode)
    .filter((code) => !codesSet.has(code));

  return {
    key: c.key,
    bron: c.pdfPaden.join(" + "),
    hadText: parsed.hadText,
    tekstlaagVerwacht: c.tekstlaagVerwacht,
    melding,
    historischeNoot: c.historischeNoot ?? null,
    import: {
      gelezen: gelezenVerwacht.length,
      verwacht: c.codes.length,
      gemist,
      spookcodes,
    },
    merk,
    status,
    keuze,
    regels,
    duurMs: Math.round(performance.now() - t0),
  };
}

// ── output: tabellen met vaste kolombreedtes ─────────────────────────────────

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function statusStr(status: Record<string, number>): string {
  const entries = Object.entries(status).sort((a, b) => b[1] - a[1]);
  return entries.length
    ? entries.map(([k, v]) => `${k}:${v}`).join(" ")
    : "–";
}

function printCase(r: CaseResultaat, rankLimit: number) {
  const out = console.log;
  out("");
  out(`═══ ${r.key} ─ ${r.bron} ═══`);
  if (r.historischeNoot) out(`  noot: ${r.historischeNoot}`);
  if (r.melding) out(`  melding: ${r.melding}`);
  out("");
  // compacte regel-tabel: code · gelezen · merk→oordeel · status · rang · keuze
  const W = { code: 9, gelezen: 8, merk: 34, status: 7, rang: 6, keuze: 22 };
  out(
    "  " +
      pad("code", W.code) +
      pad("gelezen", W.gelezen) +
      pad("merk → oordeel", W.merk) +
      pad("status", W.status) +
      pad("rang", W.rang) +
      pad("keuze", W.keuze),
  );
  out("  " + "─".repeat(W.code + W.gelezen + W.merk + W.status + W.rang + W.keuze));
  for (const regel of r.regels) {
    const merkCel = regel.gelezen
      ? `${regel.merkText ?? "∅"} → ${regel.merkOordeel}`
      : "–";
    const keuzeCel =
      regel.rang == null
        ? "–"
        : `auto:${regel.autoKeuze ? "ja" : "nee"} top-1:${regel.top1 ? "ja" : "nee"}`;
    out(
      "  " +
        pad(regel.code + (regel.spook ? "*" : ""), W.code) +
        pad(regel.gelezen ? "ja" : "NEE", W.gelezen) +
        pad(merkCel.slice(0, W.merk - 1), W.merk) +
        pad(regel.status ?? "–", W.status) +
        pad(regel.rang == null ? "–" : String(regel.rang), W.rang) +
        pad(keuzeCel, W.keuze),
    );
  }
  if (r.import.spookcodes.length) {
    out(`  * spookcodes (gelezen maar niet in grondwaarheid): ${r.import.spookcodes.length} — ${r.import.spookcodes.join(", ")}`);
  }
  out("");
  // case-samenvatting
  out(`  import : ${r.import.gelezen}/${r.import.verwacht} gelezen` +
    (r.import.gemist.length ? ` · gemist: ${r.import.gemist.join(", ")}` : "") +
    ` · spookcodes: ${r.import.spookcodes.length}`);
  out(
    `  merk   : bestaand merk ${r.merk.bestaand}/${r.merk.gelezenTotaal} · ` +
      `verwacht merk ${r.merk.verwachtGoed}/${r.merk.verwachtBekend}-waar-bekend · ` +
      `fout ${r.merk.fout} · leeg ${r.merk.leeg}`,
  );
  out(`  match  : ${statusStr(r.status)}`);
  out(
    r.keuze.nvt
      ? "  keuze  : n.v.t. — geen betrouwbare code→offerte-mapping"
      : `  keuze  : auto-keuze (B3) ${r.keuze.autoGoed}/${r.keuze.gemapt} · ` +
          `top-1 (informatief) ${r.keuze.top1Goed}/${r.keuze.gemapt} · ` +
          `kandidaat in top-${rankLimit}: ${r.keuze.inTopRank}/${r.keuze.gemapt}`,
  );
  out(`  duur   : ${(r.duurMs / 1000).toFixed(1)}s`);
}

function printEindtabel(results: CaseResultaat[], rankLimit: number) {
  const out = console.log;
  out("");
  out("═══ EINDTABEL ═══");
  const W = { key: 11, imp: 8, merk: 20, status: 24, rang: 12, auto: 11, top1: 7 };
  out(
    pad("case", W.key) +
      pad("import", W.imp) +
      pad("merk best/fout/leeg", W.merk) +
      pad("statusverdeling", W.status) +
      pad(`rang≤${rankLimit}`, W.rang) +
      pad("auto-keuze", W.auto) +
      pad("top-1", W.top1),
  );
  out("─".repeat(W.key + W.imp + W.merk + W.status + W.rang + W.auto + W.top1));
  for (const r of results) {
    const keuzeCel = r.keuze.nvt
      ? ["–", "–", "–"]
      : [
          `${r.keuze.inTopRank}/${r.keuze.gemapt}`,
          `${r.keuze.autoGoed}/${r.keuze.gemapt}`,
          `${r.keuze.top1Goed}/${r.keuze.gemapt}`,
        ];
    out(
      pad(r.key, W.key) +
        pad(`${r.import.gelezen}/${r.import.verwacht}`, W.imp) +
        pad(`${r.merk.bestaand}/${r.merk.fout}/${r.merk.leeg}`, W.merk) +
        pad(statusStr(r.status), W.status) +
        pad(keuzeCel[0], W.rang) +
        pad(keuzeCel[1], W.auto) +
        pad(keuzeCel[2], W.top1),
    );
  }
}

// ── --assert-nulmeting: de nulmeting van 16 jul, exact ───────────────────────

function assertNulmeting(results: CaseResultaat[]): string[] {
  const fouten: string[] = [];
  const by = (k: string) => results.find((r) => r.key === k);
  // canonicaliseer platte objecten (sorteer keys) zodat {blauw:30,paars:1} en
  // {paars:1,blauw:30} als gelijk gelden — insertievolgorde is geen afwijking
  const canon = (v: unknown): string =>
    v != null && typeof v === "object" && !Array.isArray(v)
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ),
        )
      : JSON.stringify(v);
  const eq = (label: string, got: unknown, want: unknown) => {
    if (canon(got) !== canon(want)) {
      fouten.push(`${label}: verwacht ${canon(want)}, gekregen ${canon(got)}`);
    }
  };

  const raadhuis = by("raadhuis");
  if (!raadhuis) fouten.push("raadhuis: case ontbreekt in de resultaten");
  else {
    eq("raadhuis hadText", raadhuis.hadText, true);
    eq("raadhuis import", `${raadhuis.import.gelezen}/${raadhuis.import.verwacht}`, "31/31");
    eq("raadhuis merk-bestaand", raadhuis.merk.bestaand, 0);
    eq("raadhuis merk-fout (alle 31 gevuld en fout — zaalnamen)", raadhuis.merk.fout, 31);
    eq("raadhuis merk-leeg", raadhuis.merk.leeg, 0);
    // {blauw:30, paars:1}: Lf901 wordt paars via het NON_LIGHTING-woord "tafel"
    eq("raadhuis statusverdeling", raadhuis.status, { blauw: 30, paars: 1 });
  }

  const kvk = by("kvk");
  if (!kvk) fouten.push("kvk: case ontbreekt in de resultaten");
  else {
    eq("kvk hadText", kvk.hadText, true);
    eq("kvk import", `${kvk.import.gelezen}/${kvk.import.verwacht}`, "0/49");
  }

  const tno = by("tno");
  if (!tno) fouten.push("tno: case ontbreekt in de resultaten");
  else {
    eq("tno hadText", tno.hadText, true);
    eq("tno import", `${tno.import.gelezen}/${tno.import.verwacht}`, "15/20");
    const verwachtGelezen = [
      "Lr001", "Lr301", "Lr302", "Lp201", "Lp202", "Lr303", "Lr304", "Lw201",
      "Lr305", "Ls001", "Ls002", "Ls003", "Lp203", "Lp602", "Lp101",
    ].sort();
    const gelezen = tno.regels
      .filter((r) => r.gelezen && !r.spook)
      .map((r) => r.code)
      .sort();
    eq("tno gelezen codes", gelezen, verwachtGelezen);
    eq(
      "tno gemiste codes",
      [...tno.import.gemist].sort(),
      ["Lr001B", "Lr001C", "Lr001_N", "Lp601a", "Lp601b"].sort(),
    );
    // "Focus" bestaat als merk → Lr305 + Ls001 rood
    eq("tno statusverdeling", tno.status, { blauw: 13, rood: 2 });
  }

  const dordrecht = by("dordrecht");
  if (!dordrecht) fouten.push("dordrecht: case ontbreekt in de resultaten");
  else {
    eq("dordrecht hadText", dordrecht.hadText, false);
    eq("dordrecht import", `${dordrecht.import.gelezen}/${dordrecht.import.verwacht}`, "0/18");
    eq(
      "dordrecht melding",
      dordrecht.melding,
      "geen tekstlaag; OCR-route overgeslagen (--ai)",
    );
  }

  return fouten;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const evalDir =
    process.env.EVAL_DIR ??
    path.join(os.homedir(), "Downloads", "lumenlogic-testset");

  if (flags.ai) {
    process.stderr.write(
      "--ai: OCR/AI-route nog niet gebouwd — gepland voor bouwstap 2. " +
        "Beeld-PDF's worden gemeld, niet gelezen.\n",
    );
  }

  // pg_trgm-smoke: de fuzzy-ranking van fetchCandidates leunt op similarity().
  try {
    await db.execute(sql`select similarity('a','a')`);
  } catch (e) {
    console.error(
      "FOUT: de pg_trgm-smoke-query (select similarity('a','a')) faalde. " +
        "Zonder de pg_trgm-extensie kan evaluateSpecLine geen kandidaten ranken — " +
        "controleer `create extension pg_trgm` op deze database én de DATABASE_URL " +
        "in .env.local. Onderliggende fout: " +
        (e instanceof Error ? e.message : String(e)),
    );
    process.exit(1);
  }

  // één brands-fetch; merk-oordeel gebeurt daarna volledig in-process
  const brandNames = (
    await db.select({ name: brands.name }).from(brands)
  ).map((b) => b.name);
  const brandKeySet = new Set(brandNames.map(brandKeyOf));

  let gitRev = "onbekend";
  try {
    gitRev = execSync("git rev-parse --short HEAD", {
      cwd: path.dirname(new URL(import.meta.url).pathname),
    })
      .toString()
      .trim();
  } catch {
    // geen git beschikbaar — meta blijft "onbekend"
  }

  const cases = flags.caseKey
    ? GRONDWAARHEID.filter((c) => c.key === flags.caseKey)
    : GRONDWAARHEID;

  const results: CaseResultaat[] = [];
  for (const c of cases) {
    results.push(await meetCase(c, evalDir, brandNames, brandKeySet, flags));
  }

  const meta = {
    datum: new Date().toISOString(),
    gitRev,
    evalDir,
    rankLimit: flags.rankLimit,
    ai: flags.ai,
    duurPerCaseMs: Object.fromEntries(results.map((r) => [r.key, r.duurMs])),
  };

  if (flags.json) {
    console.log(JSON.stringify({ meta, results }, null, 2));
  } else {
    console.log(
      `eval-testset · ${meta.datum} · rev ${meta.gitRev} · EVAL_DIR=${meta.evalDir} · rank-limit=${meta.rankLimit}`,
    );
    for (const r of results) printCase(r, flags.rankLimit);
    printEindtabel(results, flags.rankLimit);
    console.log(
      "\nduur per case: " +
        results.map((r) => `${r.key} ${(r.duurMs / 1000).toFixed(1)}s`).join(" · "),
    );
  }

  if (flags.assertNulmeting) {
    if (flags.caseKey) {
      console.error(
        "--assert-nulmeting toetst alle vier de cases; combineer hem niet met --case.",
      );
      process.exit(1);
    }
    const fouten = assertNulmeting(results);
    if (fouten.length) {
      console.error("\nNULMETING WIJKT AF — het instrument (of de keten) is veranderd:");
      for (const f of fouten) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.error("\n✓ nulmeting exact gereproduceerd (16 jul-ijkpunt)");
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
