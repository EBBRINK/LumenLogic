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
  // Codes die de bron óók letterlijk bevat maar die buiten de scope van de
  // grondwaarheid vallen (noodverlichting, sensoren, losse verwijzingen): een
  // AI-lezing die ze levert is dus GEEN hallucinatie. Het meetscript telt ze
  // apart van onverwachte spookcodes en markeert ze "(bekend, buiten scope)".
  bekendeExtraCodes?: string[];
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
    // Letterlijk in de tekstlaag geverifieerd (16 jul 2026, wegwerp-extractie):
    // de NV-noodverlichtingssectie ("NVr001 Vluchtroutes Diverse Noodverlichting",
    // "NVr201 Vluchtroutes Inbouw Noodverlichting", …) en de twee Helvar-sensoren
    // ("SENSOR_B Diverse Inbouw Sensor Helvar"). Let op: de eerder gesuggereerde
    // NVw001 staat NIET in de tekstlaag; NVr201/NVr202/NVr203 wél.
    bekendeExtraCodes: [
      "NVr001", "NVr002", "NVr201", "NVr202", "NVr203",
      "NVs201", "NVs202", "NVw101", "NVw102",
      "SENSOR_B", "SENSOR_M",
    ],
    // Fabricaatkolom per code, letterlijk geverifieerd in de tekstlaag (16 jul 2026,
    // adversariële check stap 1). De OPDRACHT-zin "één merk (XAL)" gold alleen voor
    // de vier geoffreerde codes; het boek voert zes fabricaten. De eerdere config
    // ("alles XAL") was een verkeerde aanname — de PDF wint.
    verwachtMerkPerCode: {
      Lr301: "XAL", // "Raadzaal Inbouw Downlight XAL SASSO PRO 100" — geoffreerd
      Lr303: "XAL", // "Kelder Inbouw Downlight XAL SASSO PRO 100" — geoffreerd
      Lw001: "XAL", // "Toilet Wand Lineair XAL STRETTA WALL 600×80×40" — geoffreerd
      Lw002: "XAL", // "Toilet kelder Wand Lineair XAL STRETTA WALL 900×80×40" — geoffreerd
      Lp202: "Bega", // "Vergaderruimte Pendel Rond BEGA 50 823"
      Lp203: "Bega", // "Kantoor Pendel Rond BEGA 50 823"
      Lp204: "Bega", // "Circulatie Pendel Rond BEGA 50 820"
      Lp205: "Bega", // "Belcel Pendel Rond BEGA 50 822"
      Lr304: "Bega", // "Douches Inbouw Downlight BEGA 24786W"
      Ls201: "Bega", // "Toilet voorruimte/pantry BG Opbouw Rond BEGA 50 659"
      Ls202: "Bega", // "Toiletcel Trappenhuis klein Opbouw Rond BEGA 12 141"
      Ls203: "Bega", // "Douche Opbouw Rond BEGA 24 029"
      Lr302: "Exenia", // "Raadzaal Inbouw Downlight EXENIA Dark Fix Max trimless"
      // Fabricaat staat in het boek maar (nog) niet in de brands-tabel — de
      // deterministische route hoort hier leeg te lezen; stap 3 (AI) moet ze als
      // vrije tekst leveren en stap 4/H-08 maakt ze blauw:
      Lp004: "Trilux", // "Zolder Pendel Lineair Trilux Yonos"
      Ls001: "Trilux", // "Boven legramen Opbouw Lineair Trilux Tugra"
      Ls002: "Trilux", // "Techniek/Opslag/Circulatie kelder … Trilux ARAGON FIT 1257"
      Ls003: "Trilux", // "Circulatie kelder … Trilux ARAGON FIT 695"
      Ls004: "Trilux", // "EHBO/Kleedkamer/Circulatie … Trilux 3331"
      Ls005: "Trilux", // "Keuken Opbouw Lineair Trilux Olisq"
      Lr001: "Barthelme", // "Bodepantry/horeca Inbouw Lineair Barthelme LEDLIGHT FLEX 08"
      Ls006: "Barthelme", // "Sanitaire cel … Barthelme LEDLIGHT FLEX 08"
      // GEEN entry (fabricaat "-", maatwerk architect): Lf901, Lf902, Lp201, Lp206,
      // Lp000–Lp003, Lw003 én Lw101. Let op Lw101: het record slokt de NV-noodver-
      // lichtingssectie op (NVr001… matcht CODE niet — tweede letter hoofdletter);
      // het "Etap" dat de parser daar leest is het fabricaat van NVr001, niet van
      // Lw101 — segmentatie-artefact, bevinding voor stap 3.
    },
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
      // Kaal "L010" staat NIET in de lijst: het komt in de hele tekstlaag alléén
      // voor als prozavoorbeeld op p.8 ("bijv. L010 of L011" — een keuze-instructie,
      // geen armatuurregel). Kaal L011 staat wél als echt label (p.34). Geverifieerd
      // 16 jul; de eerdere 49-telling nam het prozavoorbeeld mee — de PDF wint.
      "L010a", "L010b", "L010c", "L010d",
      "L011", "L011a", "L011b",
      "L012", "L013", "L014", "L015", "L016", "L017", "L018",
      "L019a", "L019b",
      "L020a", "L020b",
      "L021", "L022", "L023", "L024", "L025", "L026", "L031",
    ],
    // "T001" komt 6× letterlijk in de tekstlaag voor ("Track voor spot op track",
    // "L010a T001+ Rail/Track", …): de railcode waar de spots op hangen — buiten
    // de armaturen-scope, maar geen hallucinatie als een lezing hem levert.
    bekendeExtraCodes: ["T001"],
    historischeNoot:
      "nulmeting 16 jul rapporteerde 0/28 (foute zeef); LEESMIJ corrigeerde naar 20 " +
      "(óók een foute zeef); de tekstlaag bevat 48 echte codes (een 49e token, " +
      "kaal L010, bleek een prozavoorbeeld op p.8) " +
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
    // Merkkolom per code, LETTERLIJK geverifieerd in de tekstlaag (16 jul 2026,
    // wegwerp-extractie; kolomkop: "Toepassing/Functie Armatuurtype Merk
    // Productnaam"). Elk entry draagt zijn citaat. Bij Lp601a/b/Lp602 staan twee
    // subrijen onder elkaar (armatuur + lichtbron); de merkkolom paart in dezelfde
    // volgorde: eerste merk = armatuur, tweede (Philips) = de losse lichtbron.
    verwachtMerkPerCode: {
      Lr301: "Philips", // "Lr301 Basis fit-out Inbouw downlight Philips Greenspace"
      Lr302: "XAL", // "Lr302 Vergaderruimte Richtbare downlight XAL Sasso 100"
      Lr303: "XAL", // "Lr303 Belcel / Focusplek Richtbare downlight XAL Sasso 100"
      Lr304: "XAL", // "Lr304 Pantry Richtbare downlight XAL Sasso 100"
      Lr305: "XAL", // "Lr305 Focusplek Richtbare downlight XAL Sasso 100 Dubbel"
      Lp201: "Intralight", // "Lp201 Vergaderruimte Pendel armatuur Intralight Wave Round Prisma"
      Lp202: "Intralight", // "Lp202 Vergaderruimte Pendel armatuur Intralight Wave Prisma"
      Lp203: "MOOOI", // "Lp203 Woonkamer Pendel armatuur MOOOI NomNom Light"
      Lw201: "Muuto", // "Lw201 Belcel Wand armatuur Muuto Calm wall Opaal"
      Ls001: "Led linear", // "Ls001 Focusplek Lijn armatuur Led linear Xooline Opaal"
      Lp601a: "Oblure", // "Lp601a Aanlandplek Pendel armatuur lichtbron Oblure Philips Arch MASTER Value Dim"
      Lp601b: "Oblure", // "Lp601b Aanlandplek Pendel armatuur lichtbron Oblure Philips Arch MASTER Value Dim"
      Lp602: "Pantone", // "Lp602 Aanlandplek Pendel armatuur lichtbron Pantone Philips Flowerpot MASTER LED Dim" — zo gedrukt (niet "Panton")
      // GEEN entry (merk is een placeholder — de import hoort hier leeg te lezen):
      //   Lr001/Lr001B/Lr001C/Lr001_N — "Lineair inlegarmatuur n.t.b. n.t.b."
      //   Ls002 — "Te bepalen door meubelmaker voorstel:KKDC" (voorstel ≠ merk)
      //   Ls003 — "Te bepalen door wandenmaker voorstel:Led linear" (idem)
      //   Lp101 — "Lp101 Woonkamer Pendel armatuur - Rope Opaal" (merk "-")
    },
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
