// Grondwaarheid voor de vier echte testcases (stap 0 van docs/goal-import-ai-leesroute.md).
//
// PUUR CONFIG — geen imports, geen DB, geen node-API's. Dit bestand bevat uitsluitend
// armatuurcodes, merknamen en artikelcodes; NOOIT ruwe klantteksten of XIS-projectnummers.
// De PDF's zelf staan buiten de repo (EVAL_DIR, default ~/Downloads/lumenlogic-testset)
// en komen nooit in git.
//
// Empirisch geverifieerd op 16 jul 2026 (read-only nameting tegen de testset + Jayden's
// offertes). "keuze" koppelt een armatuurcode aan de artikelcode(s) die Jayden werkelijk
// offreerde — de herkomst is steeds het mail-aantal ↔ offerte-aantal dat de koppeling staaft.

export type GrondwaarheidCase = {
  key: "raadhuis" | "kvk" | "tno" | "dordrecht";
  // relatief aan EVAL_DIR; meerdere PDF's = meerdere bronnen voor dezelfde case
  pdfPaden: string[];
  // heeft de PDF een tekstlaag? (false = beeld-PDF → OCR/AI-route nodig)
  tekstlaagVerwacht: boolean;
  // alle armatuurcodes die het boek werkelijk bevat (de N van de importkolom)
  codes: string[];
  historischeNoot?: string;
  // verwacht merk per code, alleen waar empirisch gestaafd
  verwachtMerkPerCode: Record<string, string>;
  // code → artikelcode(s) uit Jayden's offerte; "setje" = meerdere niet te ontwarren
  keuze: Record<
    string,
    { artikelCodes: string[]; zekerheid: "zeker" | "setje"; herkomst: string }
  >;
  // alleen dordrecht: handgeschreven aantallen per code — stap 6 van het goal-doc
  // meet hiertegen (aantallen-kolom), de importkolom gebruikt dit veld niet.
  aantallen?: Record<string, number>;
};

export const GRONDWAARHEID: GrondwaarheidCase[] = [
  {
    key: "raadhuis",
    pdfPaden: ["1_raadhuis_de_pauw/bijlagen/Bijlage E01 - Armaturenlijst.pdf"],
    tekstlaagVerwacht: true,
    codes: [
      "Lf901", "Lf902",
      "Lp201", "Lp202", "Lp203", "Lp204", "Lp205", "Lp206",
      "Lp000", "Lp001", "Lp002", "Lp003", "Lp004",
      "Lr001", "Lr301", "Lr302", "Lr303", "Lr304",
      "Ls001", "Ls002", "Ls003", "Ls004", "Ls005", "Ls006",
      "Ls201", "Ls202", "Ls203",
      "Lw001", "Lw002", "Lw003", "Lw101",
    ],
    // het hele boek is één merk: XAL
    verwachtMerkPerCode: Object.fromEntries(
      [
        "Lf901", "Lf902",
        "Lp201", "Lp202", "Lp203", "Lp204", "Lp205", "Lp206",
        "Lp000", "Lp001", "Lp002", "Lp003", "Lp004",
        "Lr001", "Lr301", "Lr302", "Lr303", "Lr304",
        "Ls001", "Ls002", "Ls003", "Ls004", "Ls005", "Ls006",
        "Ls201", "Ls202", "Ls203",
        "Lw001", "Lw002", "Lw003", "Lw101",
      ].map((c) => [c, "XAL"]),
    ),
    keuze: {
      Lr301: {
        artikelCodes: ["L3600482413537F"],
        zekerheid: "zeker",
        herkomst: "mail 24x ↔ offerte 24x",
      },
      Lr303: {
        artikelCodes: ["L3600482412537W"],
        zekerheid: "zeker",
        herkomst: "mail 25x ↔ offerte 25x",
      },
      Lw001: {
        artikelCodes: ["L3600570132537H"],
        zekerheid: "zeker",
        herkomst: "mail 14x ↔ offerte 14x",
      },
      Lw002: {
        artikelCodes: ["L3600570133537H"],
        zekerheid: "zeker",
        herkomst: "mail 6x ↔ offerte 6x",
      },
    },
  },
  {
    key: "kvk",
    pdfPaden: ["2_kvk_alkmaar/KVK_lichtconcept.pdf"],
    tekstlaagVerwacht: true,
    // variantniveau, empirisch uit de tekstlaag (let op: L017 zit in de bron
    // vastgeplakt als "L017of")
    codes: [
      "L001a", "L001b", "L001c", "L001d", "L001e",
      "L002a", "L002b", "L002c", "L002d", "L002e",
      "L003a", "L003b", "L003c", "L003d",
      "L004", "L005", "L006",
      "L007a", "L007b",
      "L008a", "L008b",
      "L009a", "L009b",
      "L010", "L010a", "L010b", "L010c", "L010d",
      "L011", "L011a", "L011b",
      "L012", "L013", "L014", "L015", "L016", "L017", "L018",
      "L019a", "L019b",
      "L020a", "L020b",
      "L021", "L022", "L023", "L024", "L025", "L026", "L031",
    ],
    historischeNoot:
      "nulmeting 16 jul rapporteerde 0/28 (foute zeef); LEESMIJ corrigeerde naar 20 " +
      "(óók een foute zeef); de tekstlaag bevat aantoonbaar 49 unieke codetokens " +
      "(27 basiscodes) — de PDF wint.",
    verwachtMerkPerCode: {},
    // geen betrouwbare code→offerte-mapping: dezelfde Zora TAKEO bedient 15 codes
    keuze: {},
  },
  {
    key: "tno",
    pdfPaden: ["4_tno_avb/Bijlage_E02_TNO_AvB_Armaturenlijst.pdf"],
    tekstlaagVerwacht: true,
    codes: [
      "Lr001", "Lr001B", "Lr001C", "Lr001_N",
      "Lr301", "Lr302", "Lr303", "Lr304", "Lr305",
      "Lp101", "Lp201", "Lp202", "Lp203",
      "Lp601a", "Lp601b", "Lp602",
      "Ls001", "Ls002", "Ls003",
      "Lw201",
    ],
    verwachtMerkPerCode: {},
    // geen mapping beschikbaar → keuzekolom rapporteert "n.v.t.", nooit 0%
    keuze: {},
  },
  {
    key: "dordrecht",
    pdfPaden: [
      "5_dordrecht_scan/Armaturenlijst_SCAN.pdf",
      "5_dordrecht_scan/Aantallen-lijst_HANDGESCHREVEN.pdf",
    ],
    tekstlaagVerwacht: false,
    codes: [
      "Ad", "B", "C", "C1", "Cn", "C1n", "D", "E", "F", "Gn",
      "H1", "H2", "H3", "J", "S", "T", "T1", "Tn1",
    ],
    verwachtMerkPerCode: {
      Ad: "Philips",
      D: "Valerie Objects",
      F: "Aromas",
      H1: "Ferm Living",
      H2: "Ferm Living",
      H3: "Ferm Living",
    },
    keuze: {
      Ad: {
        artikelCodes: ["L322002711017110"],
        zekerheid: "zeker",
        herkomst: "aantal 124 ↔ offerte 124x",
      },
      D: {
        artikelCodes: ["L052B7219361"],
        zekerheid: "zeker",
        herkomst: "aantal 13 ↔ offerte 13x",
      },
      F: {
        artikelCodes: ["L348A1132MATTBR"],
        zekerheid: "zeker",
        herkomst: "aantal 3 ↔ offerte 3x",
      },
      H1: {
        artikelCodes: ["L3441104269826", "L3441104269825", "L3441104269824"],
        zekerheid: "setje",
        herkomst: "elk 4x; drie Kurbis-maten niet te ontwarren",
      },
      H2: {
        artikelCodes: ["L3441104269826", "L3441104269825", "L3441104269824"],
        zekerheid: "setje",
        herkomst: "elk 4x; drie Kurbis-maten niet te ontwarren",
      },
      H3: {
        artikelCodes: ["L3441104269826", "L3441104269825", "L3441104269824"],
        zekerheid: "setje",
        herkomst: "elk 4x; drie Kurbis-maten niet te ontwarren",
      },
      // B/Gn/Tn1 (elk 2 stuks) bewust niet gemapt — ambigu.
    },
    aantallen: {
      Ad: 124, B: 2, C: 34, C1: 50, Cn: 1, C1n: 1, D: 13, E: 100, F: 3,
      Gn: 2, H1: 4, H2: 4, H3: 4, J: 199, S: 5, T: 9, T1: 1, Tn1: 2,
    },
  },
];

export function grondwaarheidByKey(key: string): GrondwaarheidCase | undefined {
  return GRONDWAARHEID.find((c) => c.key === key);
}
