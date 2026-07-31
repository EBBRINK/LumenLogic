// Eén bron voor de estimate (stap 9): deze tests bewijzen dat getEstimateData exact
// dezelfde cijfers oplevert als wat quote-view toonde: groen 12×310 + 2×120 = 3.960,
// geel 8×199 = 1.592, samen 5.552 — en dat élke niet-tellende status (blauw/rood/paars/
// open) als p.m. meegaat zonder ooit opgeteld te worden. (De 2×120 kwam er bij A7 bij:
// zie de fixture-toelichting hieronder.)
//
// De gele regel draagt sinds A8 zowel een catalogusprijs (226) als een dagprijs (199);
// daarvóór stond de dagprijs in élke fixture op een regel ZONDER match, dus hoefde
// I-04 nooit tussen twee gevulde prijzen te kiezen en bleef de suite groen als je de
// voorkeur omdraaide. Daarom is het gele regeltotaal 1.592 en niet 1.808, en het
// samen-totaal 5.312 en niet 5.528: de dagprijs wint, ook in het projecttotaal.
import { expect, test } from "vitest";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { STATUS, STATUS_ORDER, type MatchStatus } from "@/components/dossier/status";
import { DEFAULT_VALIDITY_DAYS, generateQuote, updateQuoteHeader } from "./dossiers";
import { setStatus } from "./project-status";
import {
  computeEstimate,
  countedLineTotal,
  countsInTotal,
  dayPriceExpiredNote,
  getEstimateData,
  notableDeviations,
  pmSummary,
  ESTIMATE_DISCLAIMER,
  NUMBER_PENDING,
  PM_STATUSES,
  type EstimateLine,
} from "./estimate";

// ── De wet: welke statussen tellen mee (E-02) ────────────────────────────────
//
// Reviewzwerm B14. De fixtures hieronder bewijzen dit toevallig NIET: hun blauwe en
// rode regels hebben geen prijs, dus `countsInTotal` mocht daar stiekem `true` gaan
// zeggen zonder dat één test rood werd. Deze test pint de functie daarom rechtstreeks
// en uitputtend — hij is de enige bron voor "telt mee in het totaal" (components/
// dossier/status.ts beschrijft alléén het uiterlijk en de betekenis van een status).
const TELT_MEE: Record<MatchStatus, boolean> = {
  groen: true, // wij hebben het product, binnen de groene marge → in het totaal
  geel: true, // zelfde merk, afwijking binnen de gele marge → in het totaal
  blauw: false, // merk nog niet in de catalogus (datagat) → p.m.
  rood: false, // merk ja, dit product nee → p.m.
  paars: false, // buiten assortiment; wél gemeld, nooit opgeteld
  open: false, // nog niet gematcht → p.m.
};

test("countsInTotal: precies groen + geel tellen mee, alle zes statussen vastgelegd", () => {
  // Een nieuwe status dwingt een expliciete keuze af: verschijnt hij in STATUS zonder
  // hier te staan, dan valt deze test om in plaats van stilzwijgend mee te tellen.
  const bekend = Object.keys(STATUS).sort();
  expect(Object.keys(TELT_MEE).sort()).toEqual(bekend);
  expect([...STATUS_ORDER].sort()).toEqual(bekend);

  for (const status of STATUS_ORDER) {
    expect(countsInTotal(status), `status ${status}`).toBe(TELT_MEE[status]);
  }

  // Dezelfde wet nog eens van de andere kant: exact twee statussen tellen mee.
  expect(STATUS_ORDER.filter((s) => countsInTotal(s))).toEqual(["groen", "geel"]);

  // En de val die B14 opleverde: STATUS mag deze vraag niet óók beantwoorden. Stond er
  // een `countsInTotal`-veld op de meta (het stond er, mét voor paars de tegengestelde
  // waarde), dan leest de volgende sessie dát en telt paars mee op een klantstuk.
  for (const status of STATUS_ORDER) {
    expect(Object.keys(STATUS[status]), `meta ${status}`).not.toContain("countsInTotal");
  }
});

// ── De verantwoording (reviewzwerm A4) ───────────────────────────────────────
//
// Wat niet meetelt in het totaal krijgt "p.m." in de regeltotaalkolom van een
// klantstuk. Dan moet élke niet-tellende status óók in de verantwoordingsregel en in de
// voettekst staan — anders drukt de PDF "p.m." af zonder ergens uit te leggen wat dat
// hier betekent. Dat gebeurde met `open`: drie handgeschreven filters (blauw/rood/
// paars) tegenover één countsInTotal die er vier uitsluit.
test("p.m.-statussen zijn afgeleid van countsInTotal — geen handgeschreven lijst", () => {
  // De afleiding zelf: exact het complement van "telt mee", in STATUS_ORDER-volgorde.
  expect(PM_STATUSES).toEqual(STATUS_ORDER.filter((s) => !countsInTotal(s)));
  expect(PM_STATUSES).toEqual(["blauw", "rood", "paars", "open"]);
  // Samen dekken tellend + p.m. álle zes de statussen: niets valt tussen wal en schip.
  expect([...PM_STATUSES, ...STATUS_ORDER.filter((s) => countsInTotal(s))].sort()).toEqual(
    [...STATUS_ORDER].sort(),
  );

  const line = (id: string, status: (typeof STATUS_ORDER)[number]): EstimateLine => ({
    id, fixtureCode: id.toUpperCase(), status, productName: null, sku: null,
    quantity: 1, unitPrice: "100.00",
  });
  const header = {
    quoteNumber: null, quoteDate: "2026-07-07", customer: null, projectRef: null,
    author: null, validUntil: "2026-08-07",
  };
  const c = computeEstimate(header, [
    line("a", "groen"), line("b", "blauw"), line("c", "open"),
    line("d", "rood"), line("e", "open"), line("f", "paars"),
  ]);
  expect(c.totals.samen).toBe(100); // alleen de groene regel
  expect(c.pm).toEqual({ blauw: 1, rood: 1, paars: 1, open: 2, total: 5 });
  expect(c.openLines.map((l) => l.id)).toEqual(["c", "e"]);
  expect(c.pmLines.map((l) => l.id)).toEqual(["b", "c", "d", "e", "f"]);

  // De verantwoordingsregel: alle aanwezige p.m.-statussen, geen nul-ruis ("purple 0").
  expect(pmSummary(c.pm)).toBe("blue 1 · red 1 · purple 1 · open 2");
  const zonderPaars = computeEstimate(header, [line("a", "groen"), line("c", "open")]);
  expect(pmSummary(zonderPaars.pm)).toBe("open 1");
  expect(pmSummary(zonderPaars.pm)).not.toContain("purple");
  // Een dossier van alléén open regels — de normale stand na een import — heeft een
  // p.m.-totaal > 0 en dus een verantwoordingsregel. Vóór A4 was dit 0 en verdween die
  // regel compleet van het klantstuk.
  expect(zonderPaars.pm.total).toBe(1);

  // De voettekst is één string voor scherm én PDF en noemt élke status bij naam.
  expect(ESTIMATE_DISCLAIMER).toBe(
    "Gross prices excl. VAT from valid price lists. Only green and yellow count; " +
      "blue, red, purple and open are shown as p.m. — displayed, not totaled. " +
      "Request order is preserved.",
  );
  for (const s of PM_STATUSES) {
    expect(ESTIMATE_DISCLAIMER, `voettekst noemt ${s}`).toContain(
      STATUS[s].label.toLowerCase(),
    );
  }
});

// Twee zones, álle p.m.-statussen (blauw, rood, paars én open), één geel met
// afwijkingsnotitie, één paars mét prijs (mag nooit meetellen), één groen zonder
// aantal, en één OPEN regel mét aantal én dagprijs — de normale stand van een verse
// import (A4). De insert-volgorde is bewust gescrambeld: sortOrder bepaalt de
// aanvraagvolgorde.
//
// A8: de GELE regel is gematcht (catalogus 226) én draagt een dagprijs (199). Dat is
// het geval waar I-04 écht een keuze maakt — de calculator zet een dagprijs juist
// omdat de catalogusprijs achterhaald is.
//
// A7: daar staat sinds de vervalregel een GROENE regel naast (Lv700) waarvan de dagprijs
// (199) is VERLOPEN — gematcht op een product met catalogusprijs 120. Die regel moet de
// catalogusprijs dragen, het merkteken krijgen, en met 2×120 = 240 in het groentotaal
// belanden. Vandaar dat groen 3.960 is en niet 3.720, en samen 5.552 en niet 5.312.
async function seedEstimateDossier(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();

  const p1 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
  });
  const p2 = await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "SCAVA WALL SURF 1.0 3000K",
    price: "226.00",
    articleCode: "L092-SCAVA",
  });
  const p3 = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 60 2700K",
    price: "100.00",
    articleCode: "L360-SASSO60",
  });
  // A7: het product waarop de VERLOPEN dagprijs terugvalt. Eigen bedrag (120), zodat
  // het in de totalen niet te verwarren is met een van de andere regels.
  const p4 = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "SPLITBOX 3 TRIMLESS 2700K",
    price: "120.00",
    articleCode: "L210-SPLITBOX",
  });

  const rows = [
    // aanvraagvolgorde 0..7 — insert-volgorde wijkt bewust af
    { fixtureCode: "Lp302", zone: "B-02", status: "groen", quantity: null, matchedProductId: p3.productId, sortOrder: 5, brandText: "XAL", productText: "SASSO 60", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lp301", zone: "A-08", status: "groen", quantity: 12, matchedProductId: p1.productId, sortOrder: 0, brandText: "XAL", productText: "SASSO 100", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lx900", zone: "B-02", status: "paars", quantity: 2, matchedProductId: null, sortOrder: 4, brandText: null, productText: "Wandcontactdoos wit", manualPrice: "500.00", manualPriceValidUntil: null, deviations: null },
    {
      // A8: gematcht (catalogus 226) MÉT dagprijs 199 — I-04 moet hier kiezen. Geen
      // vervaldatum, dus de dagprijs blijft winnen: dit is de tegenproef van Lv700.
      fixtureCode: "Lw201", zone: "A-08", status: "geel", quantity: 8, matchedProductId: p2.productId, sortOrder: 1, brandText: "Wever & Ducré", productText: "SCAVA 1.0", manualPrice: "199.00", manualPriceValidUntil: null,
      deviations: [
        { field: "kelvin", requested: 2700, delivered: 3000, verdict: "geel", note: "3000K i.p.v. 2700K" },
      ],
    },
    { fixtureCode: "Lr050", zone: "B-02", status: "rood", quantity: 3, matchedProductId: null, sortOrder: 3, brandText: "XAL", productText: "MINIMAL 60 (bestaat niet)", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    { fixtureCode: "Lb110", zone: "A-08", status: "blauw", quantity: 5, matchedProductId: null, sortOrder: 2, brandText: "Kreon", productText: "Prologe 80", manualPrice: null, manualPriceValidUntil: null, deviations: null },
    // OPEN mét aantal én dagprijs: 4×175 = 700 zou het totaal vervuilen als open
    // ooit zou meetellen — en zonder de afleiding viel deze regel buiten élke
    // verantwoording terwijl de PDF er wél "p.m." naast zette (A4).
    { fixtureCode: "Lo400", zone: "B-02", status: "open", quantity: 4, matchedProductId: null, sortOrder: 6, brandText: "Modular", productText: "Smart Tubed 82", manualPrice: "175.00", manualPriceValidUntil: null, deviations: null },
    // A7: gematcht (catalogus 120) mét een dagprijs (199) die in 2020 verliep. Zonder de
    // vervalregel draagt deze regel voor altijd 199 — het scenario uit de bevinding.
    { fixtureCode: "Lv700", zone: "A-08", status: "groen", quantity: 2, matchedProductId: p4.productId, sortOrder: 7, brandText: "Delta Light", productText: "SPLITBOX 3", manualPrice: "199.00", manualPriceValidUntil: "2020-06-30", deviations: null },
  ] as const;

  for (const r of rows) {
    await db.insert(specLines).values({
      dossierId: dossier.id,
      fixtureCode: r.fixtureCode,
      zone: r.zone,
      status: r.status,
      quantity: r.quantity,
      matchedProductId: r.matchedProductId,
      brandText: r.brandText,
      productText: r.productText,
      manualPrice: r.manualPrice,
      manualPriceValidUntil: r.manualPriceValidUntil,
      deviations: r.deviations ? [...r.deviations] : null,
      sortOrder: r.sortOrder,
    });
  }
  return dossier.id;
}

test("regels in aanvraagvolgorde; totalen exact wat het scherm toonde", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const data = await getEstimateData(db, dossierId);
  expect(data).not.toBeNull();
  const { lines, computed } = data!;

  // aanvraagvolgorde 0..7 — nooit hersorteren op status of prijs
  expect(lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lw201", "Lb110", "Lr050", "Lx900", "Lp302", "Lo400", "Lv700",
  ]);

  // groen 12×310 + 2×120 (Lv700 op zijn CATALOGUSprijs, A7) = 3.720 + 240 = 3.960 ;
  // geel 8×199 = 1.592 (dagprijs, niet de catalogus 226) ; samen 5.552.
  // Vóór A7 stond hier groen 3.720 en samen 5.312 — met de verlopen dagprijs van 199
  // zou Lv700 er 2×199 = 398 in leggen en las de klant groen 4.118 / samen 5.710.
  expect(computed.totals).toEqual({ groen: 3960, geel: 1592, samen: 5552 });

  // blauw/rood/paars/open: p.m. — getoond, nooit opgeteld (paars 2×500 en open 4×175
  // zitten NIET in samen). Exacte vorm: een nieuwe sleutel valt hier meteen op.
  expect(computed.pm).toEqual({ blauw: 1, rood: 1, paars: 1, open: 1, total: 4 });
  const paars = lines.find((l) => l.status === "paars")!;
  expect(paars.unitPrice).toBe("500.00"); // dagprijs zichtbaar…
  expect(countedLineTotal(paars)).toBeNull(); // …maar telt nooit mee

  // open is géén randgeval maar de normale stand: hij hoort in de p.m.-verantwoording,
  // niet alleen als "p.m." in de regeltotaalkolom (A4).
  expect(computed.openLines.map((l) => l.fixtureCode)).toEqual(["Lo400"]);
  const open = lines.find((l) => l.status === "open")!;
  expect(open.unitPrice).toBe("175.00"); // prijs én aantal…
  expect(open.quantity).toBe(4);
  expect(countedLineTotal(open)).toBeNull(); // …en toch nul invloed op het totaal

  // pmLines = álle niet-tellende regels, in aanvraagvolgorde — de lijst waar de PDF en
  // het scherm overheen lopen, zodat geen status vergeten kán worden.
  expect(computed.pmLines.map((l) => l.fixtureCode)).toEqual([
    "Lb110", "Lr050", "Lx900", "Lo400",
  ]);
  expect(computed.pmLines).toHaveLength(computed.pm.total);
  // …en het is precies het complement van "telt mee in het totaal".
  expect(computed.pmLines.every((l) => !countsInTotal(l.status))).toBe(true);
  expect(lines.filter((l) => !countsInTotal(l.status))).toHaveLength(4);
  expect(lines).toHaveLength(8); // 7 + de A7-regel Lv700

  // De zin die letterlijk op het klantstuk komt (scherm én PDF).
  expect(pmSummary(computed.pm)).toBe("blue 1 · red 1 · purple 1 · open 1");

  // groen zonder aantal → p/st: telt niet mee in het totaal
  const zonderAantal = lines.find((l) => l.fixtureCode === "Lp302")!;
  expect(countedLineTotal(zonderAantal)).toBeNull();

  // afwijkingsnotitie (C-07) blijft aan de regel hangen
  const geel = lines.find((l) => l.status === "geel")!;
  expect(notableDeviations(geel).map((d) => d.note)).toEqual([
    "3000K i.p.v. 2700K",
  ]);

  // I-04 op een GEMATCHTE regel (A8): dagprijs 199 wint van catalogusprijs 226 — op de
  // stukprijs, op het regeltotaal én in het projecttotaal, want dát is het cijfer dat
  // de klant leest. Draai de voorkeur om in unitPriceOf en alle drie gaan rood.
  expect(geel.unitPrice).toBe("199.00");
  expect(geel.unitPrice).not.toBe("226.00");
  expect(countedLineTotal(geel)).toBe(1592); // 8 × 199, niet 8 × 226 = 1.808
  expect(computed.totals.geel).toBe(1592);
  // …en de gele regel draagt géén vervalmerkteken: zijn dagprijs heeft geen einddatum.
  expect(geel.dayPriceExpiredOn).toBeNull();

  // open punten: blauw merk inladen
  expect(computed.brandFreq).toEqual([["Kreon", 1]]);
});

// A7, de bevinding zelf: een dagprijs van 199 die op 30 juni 2020 verliep. Vóór deze fix
// las de klant in élk jaar daarna nog steeds € 199,00 — op het scherm, op de PDF en in
// de XIS-export — omdat manual_price_valid_until door geen enkele regel werd gelezen.
test("A7: een verlopen dagprijs valt terug op de catalogusprijs, met merkteken, óók in het totaal", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const { lines, computed } = (await getEstimateData(db, dossierId))!;
  const verlopen = lines.find((l) => l.fixtureCode === "Lv700")!;

  // De stukprijs is de CATALOGUSprijs — de verouderde 199 komt er niet meer uit.
  expect(verlopen.unitPrice).toBe("120.00");
  expect(verlopen.unitPrice).not.toBe("199.00");
  // Het merkteken staat er, mét de datum waarop de dagprijs verliep: nooit stilzwijgend.
  expect(verlopen.dayPriceExpiredOn).toBe("2020-06-30");
  // De zin die letterlijk op scherm én PDF komt.
  expect(dayPriceExpiredNote(verlopen)).toBe(
    "day price expired 30 Jun 2020 — catalogue price used instead",
  );

  // Het regeltotaal en het projecttotaal rekenen met de catalogusprijs. Dít is het
  // cijfer dat de klant leest: 2 × 120 = 240, niet 2 × 199 = 398.
  expect(countedLineTotal(verlopen)).toBe(240);
  expect(computed.totals.groen).toBe(3960); // 12×310 + 240
  expect(computed.totals.samen).toBe(5552); // 3.960 + 1.592
  expect(computed.totals.samen).not.toBe(5710); // wat het was mét de verlopen 199

  // Een regel zonder verlopen dagprijs krijgt geen merkteken en dus geen subregel.
  const groen = lines.find((l) => l.fixtureCode === "Lp301")!;
  expect(groen.dayPriceExpiredOn).toBeNull();
  expect(dayPriceExpiredNote(groen)).toBeNull();
});

test("zones: groepskoppen in eerste-verschijning-volgorde, met subtotalen", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const { computed } = (await getEstimateData(db, dossierId))!;
  expect(computed.hasZones).toBe(true);
  expect(computed.groups.map((g) => g.zone)).toEqual(["A-08", "B-02"]);

  // A-08: groen 3.720 + geel 1.592 (dagprijs) + Lv700 2×120 (A7: catalogus, want de
  // dagprijs verliep) = 5.552; B-02: alleen p.m./p-st → subtotaal 0 (ook mét de open
  // regel van 4×175 erin — die telt nergens mee)
  expect(computed.groups[0].subtotal).toBe(5552);
  expect(computed.groups[1].subtotal).toBe(0);

  // nummering volgt de globale aanvraagvolgorde, niet de zone-groepering — Lv700 staat
  // als laatste in de aanvraag (nr 8) maar als vierde in zone A-08.
  expect(
    computed.groups.flatMap((g) => g.lines.map((nl) => [nl.nr, nl.line.fixtureCode])),
  ).toEqual([
    [1, "Lp301"], [2, "Lw201"], [3, "Lb110"], [8, "Lv700"],
    [4, "Lr050"], [5, "Lx900"], [6, "Lp302"], [7, "Lo400"],
  ]);
});

// Het nummer wordt toegekend bij GENEREREN (nextQuoteNumber) en daarna bewaard — niet
// bij uitsturen, wat A-09 wél zegt. De weergavetekst volgt sinds 2026-07-30 de code;
// die tegenspraak staat als besluit voor Timo in HANDOVER.md. Wat in bug #6 veranderde
// was de vorm: de oude fallback `BL-2026-{nummer volgt}` was Nederlands mét accolades
// op een Engelstalig klantstuk.
test("kopblok: vóór genereren geen nummer maar de wachttekst, ná genereren het echte offertenummer", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);

  const before = (await getEstimateData(db, dossierId))!;
  expect(before.header.quoteNumber).toBeNull();
  expect(before.computed.quoteNumberDisplay).toBe(NUMBER_PENDING);
  expect(before.computed.quoteNumberAssigned).toBe(false);
  // Geen sjabloonhaken en geen Nederlands meer op het klantstuk.
  expect(before.computed.quoteNumberDisplay).not.toMatch(/[{}]/);
  expect(before.computed.quoteNumberDisplay).not.toContain("nummer volgt");
  // De tekst moet waar zijn: het nummer komt bij genereren, niet bij versturen. Zou
  // hij weer "on sending" beloven, dan liegt het klantstuk over zijn eigen software.
  expect(NUMBER_PENDING).toBe("Number assigned when the estimate is generated");
  expect(NUMBER_PENDING).not.toContain("on sending");

  await generateQuote(db, dossierId, "hello@noplasticfloralfoam.com");

  const after = (await getEstimateData(db, dossierId))!;
  const year = new Date().getFullYear();
  expect(after.header.quoteNumber).toBe(`BL-${year}-0001`);
  expect(after.computed.quoteNumberDisplay).toBe(`BL-${year}-0001`);
  expect(after.computed.quoteNumberAssigned).toBe(true);
  expect(after.header.customer).toBe("Deerns");
  expect(after.header.author).toBe("hello@noplasticfloralfoam.com");
  expect(after.quote?.frozenAt ?? null).toBeNull();
});

test("computeEstimate is puur: zelfde invoer → zelfde uitkomst, lege lijst → nul", () => {
  const header = {
    quoteNumber: null,
    quoteDate: "2026-07-07",
    customer: null,
    projectRef: null,
    author: null,
    validUntil: null,
  };
  const empty = computeEstimate(header, []);
  expect(empty.totals).toEqual({ groen: 0, geel: 0, samen: 0 });
  expect(empty.pm).toEqual({ blauw: 0, rood: 0, paars: 0, open: 0, total: 0 });
  expect(empty.pmLines).toEqual([]);
  expect(pmSummary(empty.pm)).toBe(""); // niets te verantwoorden → geen zin
  expect(empty.groups).toEqual([]);
  expect(empty.quoteNumberDisplay).toBe(NUMBER_PENDING);
});

// Kopblokpoort (UX-audit bug #6): met een lege datum of geldigheid is het stuk geen
// aanbod. computeEstimate is de enige bron daarvan — scherm, PDF-route en de
// downloadroute lezen alle drie dit veld.
test("kopblokpoort: datum én geldigheid nodig, en de ontbrekende velden staan er bij naam", () => {
  const basis = {
    quoteNumber: null,
    quoteDate: null,
    customer: "Deerns",
    projectRef: "PRJ-42",
    author: "timo@brink.nl",
    validUntil: null,
  };
  const leeg = computeEstimate(basis, []);
  expect(leeg.headerComplete).toBe(false);
  expect(leeg.missingHeaderFields).toEqual(["Date", "Valid until"]);

  // Eén van de twee is niet genoeg.
  expect(
    computeEstimate({ ...basis, quoteDate: "2026-07-07" }, []).missingHeaderFields,
  ).toEqual(["Valid until"]);
  expect(
    computeEstimate({ ...basis, validUntil: "2026-08-07" }, []).missingHeaderFields,
  ).toEqual(["Date"]);

  // generateQuote vult sinds 2026-07-30 datum én geldigheid (zie de test verderop);
  // deze stand is dus wat een verse generatie oplevert.
  const compleet = computeEstimate(
    { ...basis, quoteDate: "2026-07-07", validUntil: "2026-08-07" },
    [],
  );
  expect(compleet.headerComplete).toBe(true);
  expect(compleet.missingHeaderFields).toEqual([]);

  // Een veld met alleen witruimte telt niet als ingevuld.
  expect(
    computeEstimate({ ...basis, quoteDate: "  ", validUntil: "2026-08-07" }, [])
      .headerComplete,
  ).toBe(false);
});

// ── De poort zelf (herstel 2026-07-30) ───────────────────────────────────────
//
// De poort van bug #6 was een val: hij hing aan headerComplete, en géén codepad vulde
// ooit valid_until. Drie gewone klikken (Generate estimate → status "estimate
// gestuurd" → tab Estimate) haalden Print, Download PDF en → To XIS wég bij een
// offerte die al verstuurd wás, terwijl het kopblok op dat moment op slot zit. Twee
// besluiten repareren dat; deze tests pinnen ze allebei.

test("poort: een BEVROREN offerte is nooit gepoort, ook niet met een lege kop", () => {
  const leegBevroren = {
    quoteNumber: "BL-2026-0001",
    quoteDate: null,
    customer: "Deerns",
    projectRef: "PRJ-42",
    author: "timo@brink.nl",
    validUntil: null,
  };
  const bevroren = computeEstimate(leegBevroren, [], { frozen: true });
  // De kop is en blijft incompleet — dat feit versluieren we niet…
  expect(bevroren.headerComplete).toBe(false);
  expect(bevroren.missingHeaderFields).toEqual(["Date", "Valid until"]);
  // …maar de poort staat open: dit stuk IS het verstuurde document.
  expect(bevroren.frozen).toBe(true);
  expect(bevroren.outputsAllowed).toBe(true);

  // Exact dezelfde kop, níét bevroren → poort dicht. Zonder dit verschil is de
  // uitzondering betekenisloos.
  const open = computeEstimate(leegBevroren, [], { frozen: false });
  expect(open.outputsAllowed).toBe(false);
  // …en zonder opts is de default veilig: niet bevroren.
  expect(computeEstimate(leegBevroren, []).outputsAllowed).toBe(false);
});

test("poort: getEstimateData leest de bevriezing uit de quote-rij, niet uit een prop", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, dossierId, "timo@brink.nl");

  // De mens maakt de geldigheid leeg — dát is de enige manier waarop de poort nog
  // dichtgaat na een generatie.
  await updateQuoteHeader(db, dossierId, { validUntil: null }, "timo@brink.nl");
  const leeg = (await getEstimateData(db, dossierId))!;
  expect(leeg.frozen).toBe(false);
  expect(leeg.computed.outputsAllowed).toBe(false);

  // Status "estimate gestuurd" bevriest de offerte (I-06). Vanaf dat moment is het
  // stuk verstuurd en moet het altijd opnieuw te printen zijn — de drie-kliksval.
  await setStatus(db, dossierId, "estimate_gestuurd", "timo@brink.nl");
  const na = (await getEstimateData(db, dossierId))!;
  expect(na.quote?.frozenAt).not.toBeNull();
  expect(na.frozen).toBe(true);
  expect(na.computed.headerComplete).toBe(false); // de kop is nog steeds leeg…
  expect(na.computed.outputsAllowed).toBe(true); // …en toch mag het stuk naar buiten
});

test("generateQuote stelt een geldigheid voor, zodat een verse estimate niet meteen achter de poort valt", async () => {
  const db = await createTestDb();
  const dossierId = await seedEstimateDossier(db);
  await generateQuote(db, dossierId, "timo@brink.nl");

  const data = (await getEstimateData(db, dossierId))!;
  expect(data.header.quoteDate).not.toBeNull();
  // Voorstel = offertedatum + DEFAULT_VALIDITY_DAYS, in UTC gerekend.
  const verwacht = new Date(`${data.header.quoteDate}T00:00:00Z`);
  verwacht.setUTCDate(verwacht.getUTCDate() + DEFAULT_VALIDITY_DAYS);
  expect(data.header.validUntil).toBe(verwacht.toISOString().slice(0, 10));

  // En daarmee is de kop compleet: genereren → printen kan, zonder tussenstop.
  expect(data.computed.headerComplete).toBe(true);
  expect(data.computed.outputsAllowed).toBe(true);

  // Hergenereren respecteert een handmatige geldigheid (bewaren, niet overschrijven).
  await updateQuoteHeader(db, dossierId, { validUntil: "2027-01-31" }, "timo@brink.nl");
  await generateQuote(db, dossierId, "timo@brink.nl");
  expect((await getEstimateData(db, dossierId))!.header.validUntil).toBe("2027-01-31");
});

test("offertenummer met alleen witruimte telt niet als toegekend", () => {
  const basis = {
    quoteNumber: "   ",
    quoteDate: "2026-07-07",
    customer: null,
    projectRef: null,
    author: null,
    validUntil: "2026-08-07",
  };
  const c = computeEstimate(basis, []);
  // Zonder de trim leverde dit een lege PDF-titel op ("Estimate    — …").
  expect(c.quoteNumberAssigned).toBe(false);
  expect(c.quoteNumberDisplay).toBe(NUMBER_PENDING);
  // En een nummer mét spaties eromheen wordt netjes getrimd getoond.
  expect(
    computeEstimate({ ...basis, quoteNumber: " BL-2026-0007 " }, [])
      .quoteNumberDisplay,
  ).toBe("BL-2026-0007");
});
