// Adversariële integratietests op de vijfstatussen-matcher (masterplan §3 / functioneel
// ontwerp §4.3). Elke van de 7 invarianten krijgt een eigen test, met een echte mini-
// catalogus via createTestDb + seedBrandProduct/addProductToBrand. We toetsen tegen
// docs/matching-regelset.md — niet tegen aannames. Plus PAARS (niet-verlichting) en
// BLAUW (merk niet in catalogus → op de inlaadwachtrij).
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedBrand,
  seedBrandAlias,
  seedBrandProduct,
  addProductToBrand,
  type TestDb,
} from "@/db/test-db";
import { events, projectDossiers, specLines, brandLoadQueue } from "@/db/schema";
import {
  evaluateSpecLine,
  brandKeyOf,
  pickUnambiguousYellow,
  type SpecRequest,
} from "./engine";
import type { MatchDeviation } from "@/db/schema";
import { worstVerdict } from "./tolerances";
import { runMatcher } from "@/lib/repo/matching";

// Kleine helper: een spec-request met sensible defaults.
function req(partial: Partial<SpecRequest> & { specs?: SpecRequest["specs"] }): SpecRequest {
  return {
    brandText: partial.brandText ?? null,
    productText: partial.productText ?? null,
    sku: partial.sku ?? null,
    nonLighting: partial.nonLighting,
    specs: partial.specs ?? {},
  };
}

// ── Invariant 1: niets stilzwijgend weglaten — elke regel krijgt een status ───
test("inv1: elke aanvraag krijgt een gedefinieerde, geldige status (nooit undefined)", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ",
    kelvin: 3000,
    ip: "IP44",
    maxWattage: 12,
  });
  const valid = new Set(["open", "groen", "geel", "blauw", "rood", "paars"]);

  const cases: SpecRequest[] = [
    req({ brandText: "XAL", productText: "SASSO 100", specs: { kelvin: 3000 } }), // groen
    req({ brandText: "XAL", productText: "bestaat-niet-xyz", specs: {} }), // rood (merk wel, product niet)
    req({ brandText: "Occhio", productText: "Mito", specs: {} }), // blauw (merk niet in catalogus)
    req({ brandText: null, productText: "Vitra stoel", specs: {} }), // paars
    req({ brandText: "XAL", productText: "SASSO 100", specs: { kelvin: 9999 } }), // rood (kelvin fout)
  ];
  for (const c of cases) {
    const out = await evaluateSpecLine(db, c);
    expect(out.status).toBeDefined();
    expect(valid.has(out.status)).toBe(true);
  }
});

// ── Invariant 2: kandidatenlijst wordt NOOIT op prijs gesorteerd ──────────────
test("inv2: goedkoper product komt niet vóór duurder puur door prijs", async () => {
  const db = await createTestDb();
  // Het echte armatuur (prefix-match op de zoektekst) is het duurst; het accessoire
  // dat 'SASSO 100' middenin de naam draagt is spotgoedkoop.
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SNOOT LONG 100 FOR SASSO 100 / KARO 100",
    price: "16.00",
  });
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 17,9W",
    price: "310.00",
  });

  // Geen spec-eisen → niets aantoonbaar (gat A, 20 jul): beide kandidaten zijn
  // lijst 2 en de regel is open. De prijs-invariant zelf (regel 2) blijft exact
  // toetsbaar op de volgorde van lijst 2 — daar gaat deze test over.
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "XAL", productText: "SASSO 100", specs: {} }),
  );
  expect(out.status).toBe("open");
  expect(out.provable.length).toBe(0);
  expect(out.incomplete.length).toBe(2);
  // Het DUURSTE armatuur staat bovenaan (prefix-bonus), niet het goedkope accessoire.
  expect(out.incomplete[0].name).toContain("SASSO 100 SQ SP CEIL");
  expect(Number(out.incomplete[0].grossPrice)).toBeGreaterThan(
    Number(out.incomplete[1].grossPrice),
  );
});

// ── Invariant 3: lager IP dan gevraagd = ALTIJD rood; hoger = groen ───────────
test("inv3: gevraagd IP44 geleverd IP20 → rood; gevraagd IP20 geleverd IP44 → groen", async () => {
  const dbLow = await createTestDb();
  await seedBrandProduct(dbLow, { brand: "XAL", name: "Downlight A", ip: "IP20" });
  const low = await evaluateSpecLine(
    dbLow,
    req({ brandText: "XAL", productText: "Downlight A", specs: { ip: "IP44" } }),
  );
  expect(low.status).toBe("rood");
  const ipDev = low.topDeviations.find((d) => d.field === "ip");
  expect(ipDev?.verdict).toBe("rood");

  const dbHigh = await createTestDb();
  await seedBrandProduct(dbHigh, { brand: "XAL", name: "Downlight B", ip: "IP44" });
  const high = await evaluateSpecLine(
    dbHigh,
    req({ brandText: "XAL", productText: "Downlight B", specs: { ip: "IP20" } }),
  );
  expect(high.status).toBe("groen");
  expect(high.topDeviations.find((d) => d.field === "ip")?.verdict).toBe("groen");
});

// ── Invariant 4: elke afwijking benoemd, ook binnen groen ─────────────────────
test("inv4: gevraagd 12W geleverd 13W → groen mét benoemde watt-afwijking", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "Spot 12W",
    maxWattage: 13,
    kelvin: 3000,
  });
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "XAL", productText: "Spot 12W", specs: { watt: 12, kelvin: 3000 } }),
  );
  expect(out.status).toBe("groen");
  const wattDev = out.topDeviations.find((d) => d.field === "watt");
  expect(wattDev).toBeDefined();
  expect(wattDev?.verdict).toBe("groen"); // binnen ±10%
  expect(wattDev?.requested).toBe(12);
  expect(wattDev?.delivered).toBe(13);
  expect(wattDev?.note).toContain("requested 12"); // transparantieregel: het verschil staat er
  expect(wattDev?.note).toContain("13");
});

// ── Invariant 5: ontbrekende data ≠ afwijkende data ──────────────────────────
test("inv5a: kandidaat met ontbrekend veld belandt in 'incomplete' (lijst 2), niet in provable", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "Paneel Onvolledig",
    maxWattage: 12, // watt bekend en goed
    kelvin: null, // kleurtemperatuur ONTBREEKT
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "Paneel Onvolledig",
      specs: { watt: 12, kelvin: 3000 },
    }),
  );
  expect(out.provable.length).toBe(0);
  expect(out.incomplete.length).toBe(1);
  // het ontbrekende veld is 'onbekend', niet 'rood'
  const kelvinDev = out.incomplete[0].deviations.find((d) => d.field === "kelvin");
  expect(kelvinDev?.verdict).toBe("onbekend");
  // ontbrekende data mag niet als afwijking (rood) de status bepalen
  expect(out.status).not.toBe("rood");
});

test("inv5b: kandidaat met VERKEERDE (rode) waarde wordt uit beide voldoet-lijsten uitgesloten", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "Paneel Fout",
    maxWattage: 50, // gevraagd 12 → >40% → rood
    kelvin: 3000,
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "Paneel Fout",
      specs: { watt: 12, kelvin: 3000 },
    }),
  );
  // rode waarde: niet in provable, en ook niet in incomplete
  expect(out.provable.length).toBe(0);
  expect(out.incomplete.length).toBe(0);
  expect(out.status).toBe("rood");
});

// ── Invariant 6: strengste afwijking telt (rood > geel > groen) ───────────────
test("inv6: één rood veld maakt de match rood, ook al is de rest groen", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "Armatuur Mix",
    maxWattage: 12, // groen (gevraagd 12)
    ip: "IP44", // groen (gevraagd IP44)
    kelvin: 4000, // ROOD (gevraagd 3000, kelvin is exact)
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "Armatuur Mix",
      specs: { watt: 12, ip: "IP44", kelvin: 3000 },
    }),
  );
  expect(out.status).toBe("rood");
  // bewijs dat er óók groene velden zijn (de rest is groen) — toch overheerst rood
  expect(out.topDeviations.some((d) => d.verdict === "groen")).toBe(true);
  expect(worstVerdict(out.topDeviations)).toBe("rood");
});

// ── Invariant 7: statustoekenning is deterministisch (geen prijs in de beslissing) ─
test("inv7a: zelfde input → zelfde output (status + kandidaatvolgorde)", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ",
    kelvin: 3000,
    maxWattage: 12,
  });
  const request = req({
    brandText: "XAL",
    productText: "SASSO 100",
    specs: { kelvin: 3000, watt: 12 },
  });
  const a = await evaluateSpecLine(db, request);
  const b = await evaluateSpecLine(db, request);
  expect(a.status).toBe(b.status);
  expect(a.provable.map((c) => c.productId)).toEqual(b.provable.map((c) => c.productId));
  expect(a.topDeviations).toEqual(b.topDeviations);
});

test("inv7b: prijs speelt geen rol — dezelfde catalogus met omgewisselde prijzen geeft dezelfde volgorde en status", async () => {
  async function buildAndRun(sassoPrice: string, snootPrice: string) {
    const db = await createTestDb();
    await seedBrandProduct(db, {
      brand: "XAL",
      name: "SNOOT LONG 100 FOR SASSO 100",
      price: snootPrice,
    });
    await seedBrandProduct(db, {
      brand: "XAL",
      name: "SASSO 100 SQ SP CEIL",
      price: sassoPrice,
    });
    return evaluateSpecLine(
      db,
      req({ brandText: "XAL", productText: "SASSO 100", specs: {} }),
    );
  }
  const expensiveSasso = await buildAndRun("310.00", "16.00");
  const cheapSasso = await buildAndRun("16.00", "310.00");

  // status identiek (sinds gat A, 20 jul: 'open' — specloos is nooit aantoonbaar;
  // de prijs-invariant toetst nu op lijst 2, waar deze kandidaten thuishoren)
  expect(expensiveSasso.status).toBe(cheapSasso.status);
  expect(expensiveSasso.status).toBe("open");
  // kandidaatvolgorde identiek op naam (product-id's verschillen per db)
  expect(expensiveSasso.incomplete.map((c) => c.name)).toEqual(
    cheapSasso.incomplete.map((c) => c.name),
  );
  // en het armatuur staat in beide gevallen bovenaan, los van of het duur of goedkoop is
  expect(expensiveSasso.incomplete[0].name).toContain("SASSO 100 SQ SP CEIL");
  expect(cheapSasso.incomplete[0].name).toContain("SASSO 100 SQ SP CEIL");
});

// ── PAARS: niet-verlichting ───────────────────────────────────────────────────
test("paars: niet-verlichting (productText 'Vitra stoel') → paars, geen kandidaten", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "Vitra", name: "Vitra stoel model X" });
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Vitra", productText: "Vitra stoel", specs: {} }),
  );
  expect(out.status).toBe("paars");
  expect(out.provable.length).toBe(0);
  expect(out.incomplete.length).toBe(0);
});

test("paars: expliciet nonLighting-signaal → paars, zelfs met verlichtings-tekst", async () => {
  const db = await createTestDb();
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "XAL", productText: "Downlight", nonLighting: true, specs: {} }),
  );
  expect(out.status).toBe("paars");
});

// ── BLAUW: merk niet in catalogus → blauw + op de inlaadwachtrij ──────────────
test("blauw: merk niet in catalogus → status blauw + brandKey gezet", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" }); // ander merk in catalogus
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Occhio", productText: "Mito 3d", specs: {} }),
  );
  expect(out.status).toBe("blauw");
  expect(out.brandKey).toBe(brandKeyOf("Occhio"));
  expect(out.provable.length).toBe(0);
});

test("blauw: runMatcher zet het onbekende merk op de brand_load_queue en de regel op blauw", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Testdossier" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Lp001",
      brandText: "Occhio",
      productText: "Mito 3d",
    })
    .returning();

  const outcome = await runMatcher(db as TestDb, line.id);
  expect(outcome.status).toBe("blauw");

  const [saved] = await db
    .select({ status: specLines.status })
    .from(specLines)
    .where(eq(specLines.id, line.id));
  expect(saved.status).toBe("blauw");

  const queue = await db.select().from(brandLoadQueue);
  expect(queue.length).toBe(1);
  expect(queue[0].brandKey).toBe(brandKeyOf("Occhio"));
  expect(queue[0].frequency).toBe(1);
});

// ── O5 (stap 4): "bekend" = producten in de basistabel; aliassen resolven ─────
// docs/goal-import-ai-leesroute.md stap 4: de bestaanstoets verschuift van de
// merkRIJ naar productrijen in de BASISTABEL products. Een kale merkrij is een
// datagat (blauw); een merk met alleen onzichtbare (verlopen-prijslijst-)producten
// blijft bekend (rood, nooit blauw — ijzeren regel 3 blijft: kandidaten strikt uit
// visible_products). Gecureerde aliassen (brand_aliases) resolven boek-woorden naar
// het canonieke merk — nooit fuzzy.

test("o5: merkrij zonder producten → blauw (datagat), brandKey eigen key", async () => {
  const db = await createTestDb();
  await seedBrand(db, "Zumtobel"); // rij bestaat, 0 producten
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Zumtobel", productText: "PANOS", specs: {} }),
  );
  expect(out.status).toBe("blauw");
  expect(out.brandKey).toBe("zumtobel");
  expect(out.reason).toContain("geen producten");
  expect(out.provable).toHaveLength(0);
});

test("o5: merk met alléén onzichtbare producten (verlopen prijslijst) → NIET blauw maar rood", async () => {
  const db = await createTestDb();
  // Product bestaat in de basistabel maar de prijslijst is verlopen → onzichtbaar in
  // visible_products. Bekend merk dus (rood/dagprijs-territorium), geen datagat.
  await seedBrandProduct(db, {
    brand: "Modular",
    name: "Smart 48",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Modular", productText: "Smart 48", specs: {} }),
  );
  expect(out.status).toBe("rood"); // geen zichtbare kandidaten, maar merk is bekend
  expect(out.status).not.toBe("blauw");
  expect(out.provable).toHaveLength(0);
  expect(out.incomplete).toHaveLength(0);
});

test("o5: alias 'aromasdelcampo' → kandidaten van Aromas (substitutie-bewijs)", async () => {
  const db = await createTestDb();
  const aromas = await seedBrandProduct(db, {
    brand: "Aromas",
    name: "GINGER WALL 3000K",
    kelvin: 3000,
  });
  await seedBrandAlias(db, aromas.brandId, "aromasdelcampo", "Dordrecht-boek");
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Aromas del Campo", productText: "GINGER WALL", specs: {} }),
  );
  expect(out.status).not.toBe("blauw");
  // zonder substitutie zou de merkconditie ('%aromasdelcampo%') niets vinden;
  // de kandidaat bewijst dat er met de canonieke naam 'Aromas' gezocht is
  const namen = [...out.provable, ...out.incomplete].map((c) => c.name);
  expect(namen).toContain("GINGER WALL 3000K");
});

test("o5: normalisatie — 'AROMAS  del-Campo!' resolvet naar dezelfde alias", async () => {
  const db = await createTestDb();
  const aromas = await seedBrandProduct(db, {
    brand: "Aromas",
    name: "GINGER WALL 3000K",
    kelvin: 3000,
  });
  await seedBrandAlias(db, aromas.brandId, "aromasdelcampo");
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "AROMAS  del-Campo!", productText: "GINGER WALL", specs: {} }),
  );
  expect(out.status).not.toBe("blauw");
  const namen = [...out.provable, ...out.incomplete].map((c) => c.name);
  expect(namen).toContain("GINGER WALL 3000K");
});

test("o5: alias wint van naamgelijkheid — 'Signify' → blauw met canonieke brandKey 'mycreations'", async () => {
  const db = await createTestDb();
  // Het echte prod-geval: 'Signify' bestaat zélf als (lege) merkrij, maar de
  // gecureerde redirect wijst naar MyCreations (ook zonder producten) — de alias
  // gaat voor, dus de wachtrij-key wordt de canonieke 'mycreations'.
  const mycreations = await seedBrand(db, "MyCreations");
  await seedBrand(db, "Signify");
  await seedBrandAlias(db, mycreations.brandId, "signify", "Dordrecht-vision");
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "Signify", productText: "Downlight", specs: {} }),
  );
  expect(out.status).toBe("blauw");
  expect(out.brandKey).toBe("mycreations"); // canoniek, niet het boek-woord
});

test("o5: runMatcher zet bij alias-blauw de CANONIEKE key op de wachtrij + beide in het event", async () => {
  const db = await createTestDb();
  const mycreations = await seedBrand(db, "MyCreations");
  await seedBrand(db, "Signify");
  await seedBrandAlias(db, mycreations.brandId, "signify");
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Aliasdossier" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({
      dossierId: dossier.id,
      fixtureCode: "Ad",
      brandText: "Signify",
      productText: "Downlight",
    })
    .returning();

  const outcome = await runMatcher(db as TestDb, line.id);
  expect(outcome.status).toBe("blauw");

  const queue = await db.select().from(brandLoadQueue);
  expect(queue).toHaveLength(1);
  expect(queue[0].brandKey).toBe("mycreations"); // canoniek — dít merk laden wij in
  expect(queue[0].displayName).toBe("Signify"); // het boek-woord blijft leesbaar

  const evts = await db
    .select()
    .from(events)
    .where(eq(events.action, "brand_load_requested"));
  expect(evts).toHaveLength(1);
  expect(evts[0].payload).toMatchObject({
    brandText: "Signify",
    brandKey: "mycreations",
  });
});

// ── B3: geel auto-door — unambiguousYellow (de ondubbelzinnige bijna-match) ──
// Puur predicaat: alleen bij regelstatus geel én precies één kandidaat met een
// schoon-geel oordeel (geen rood, geen onbekend, geen geel op een keuzeveld).

test("b3: precies één schoon-gele kandidaat → unambiguousYellow gezet", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000, // exact → groen
    maxWattage: 14, // gevraagd 12 → 16,7% afwijking → geel
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "VELA ROUND",
      specs: { watt: 12, kelvin: 3000 },
    }),
  );
  expect(out.status).toBe("geel");
  expect(out.unambiguousYellow).toBeDefined();
  expect(out.unambiguousYellow?.name).toContain("VELA ROUND 600");
  // het gele veld is een tolerantieveld (watt), volledig beoordeelbaar
  expect(
    out.unambiguousYellow?.deviations.find((d) => d.field === "watt")?.verdict,
  ).toBe("geel");
});

test("b3: twee schoon-gele kandidaten → geen unambiguousYellow (niet ondubbelzinnig)", async () => {
  const db = await createTestDb();
  const seeded = await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000,
    maxWattage: 14, // geel
  });
  await addProductToBrand(db, {
    brandId: seeded.brandId,
    priceListId: seeded.priceListId,
    name: "VELA ROUND 900",
    kelvin: 3000,
    maxWattage: 15, // 25% → ook geel
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "VELA ROUND",
      specs: { watt: 12, kelvin: 3000 },
    }),
  );
  expect(out.status).toBe("geel");
  expect(out.unambiguousYellow).toBeUndefined();
});

test("b3: gele afwijking op een keuzeveld (dimbaarheid) → geen auto-door", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 3000,
    maxWattage: 12, // exact → groen
    dimmable: "1-10V", // gevraagd DALI → ander protocol → geel op keuzeveld
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "VELA ROUND",
      specs: { watt: 12, kelvin: 3000, dimmable: "DALI" },
    }),
  );
  expect(out.status).toBe("geel"); // dimprotocol wijkt af → geel, mens beslist
  expect(out.unambiguousYellow).toBeUndefined();
});

test("b3: geel op kleur (keuzeveld) weigert het predicaat; zelfde geel op watt mag wél", () => {
  const colorYellow = {
    deviations: [
      {
        field: "color",
        requested: "zwart",
        delivered: "wit",
        verdict: "geel",
        note: "variant: requested zwart, available wit",
      },
    ] as MatchDeviation[],
  };
  expect(pickUnambiguousYellow("geel", [colorYellow])).toBeUndefined();

  // bewijs dat de weigering aan het KEUZEVELD ligt, niet aan het gele verdict
  const wattYellow = {
    deviations: [
      {
        field: "watt",
        requested: 12,
        delivered: 14,
        verdict: "geel",
        note: "requested 12, delivered 14",
      },
    ] as MatchDeviation[],
  };
  expect(pickUnambiguousYellow("geel", [wattYellow])).toBe(wattYellow);
  // en zonder gele regelstatus nooit
  expect(pickUnambiguousYellow("groen", [wattYellow])).toBeUndefined();
});

test("b3: kandidaat met een onbekend veld → geen auto-door (niet volledig beoordeelbaar)", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: null, // gevraagd 3000 → onbekend
    maxWattage: 14, // geel
  });
  const out = await evaluateSpecLine(
    db,
    req({
      brandText: "XAL",
      productText: "VELA ROUND",
      specs: { watt: 12, kelvin: 3000 },
    }),
  );
  expect(out.status).toBe("geel"); // slechtste bekende verdict is geel…
  expect(out.unambiguousYellow).toBeUndefined(); // …maar onbekend veld blokkeert auto-door
});

test("b3: regel met alleen rood-kandidaten → rood, geen unambiguousYellow", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "VELA ROUND 600",
    kelvin: 4000, // gevraagd 3000, kelvin is exact → rood
  });
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "XAL", productText: "VELA ROUND", specs: { kelvin: 3000 } }),
  );
  expect(out.status).toBe("rood");
  expect(out.unambiguousYellow).toBeUndefined();
});

// ── Stap 3 (AI-leesroute): regels met alléén een code zijn nu bereikbaar ──────
// De leesroute kan een regel leveren zonder merk én zonder producttekst (bv. een
// KvK-conceptpagina met een kale code). Vóór de poort in fetchCandidates crashte
// dat op `ORDER BY 0` (constante sorteertermen als positionele verwijzing).
// Geen merk + geen specs wordt sinds de vacuous-green-fix (17 jul) al hiervóór
// afgevangen door de stap 1b-guard hieronder (status "open"); fetchCandidates
// wordt in dít scenario dus niet eens meer aangeroepen.
test("stap 3: geen merk, geen producttekst, geen specs → open (stap 1b), geen crash", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const out = await evaluateSpecLine(db, req({}));
  expect(out.status).toBe("open");
  expect(out.provable).toHaveLength(0);
  expect(out.incomplete).toHaveLength(0);
});

// De ORDER BY-0-guard in fetchCandidates zelf blijft nodig voor een ANDER
// scenario: wél een toetsbare spec (dus stap 1b slaat niet aan), maar geen merk
// en geen producttekst om op te zoeken — fetchCandidates moet dan nog steeds
// zonder crash [] teruggeven (→ rood, geen kandidaten).
test("wél een gevraagde spec maar geen merk/producttekst om op te zoeken → rood zonder crash", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const out = await evaluateSpecLine(db, req({ specs: { kelvin: 3000 } }));
  expect(out.status).toBe("rood");
  expect(out.provable).toHaveLength(0);
  expect(out.incomplete).toHaveLength(0);
});

test("stap 3: wél merk maar geen producttekst → kandidaten binnen merk, geen crash", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  await seedBrandProduct(db, { brand: "Flos", name: "Bellhop" });
  const out = await evaluateSpecLine(db, req({ brandText: "XAL" }));
  // Sinds gat A (20 jul): geen specs gevraagd → niets aantoonbaar, dus de
  // kandidaat staat in lijst 2 en de regel is open. De kern van deze test
  // blijft: geen ORDER BY-crash en merk-scoping (Bellhop hoort er niet in).
  expect(out.status).toBe("open");
  expect(out.provable).toHaveLength(0);
  const namen = [...out.provable, ...out.incomplete].map((c) => c.name);
  expect(namen).toContain("SASSO 100");
  expect(namen).not.toContain("Bellhop");
});

// ── "Vacuous green" (live-check 17 jul, dossier ae0eead9, regel Lf902) ───────
// Zonder merk en zonder één toetsbare spec is de eis leeg; tegen een lege eis
// "voldoet" elke kandidaat triviaal (judgeCandidate levert deviations=[], en
// worstVerdict([]) === "groen"). Live: Lf902 (merk null, alle req_*-velden null,
// productText "Vloer armatuur nabij taakgebieden...") kreeg zo 8 accessoires als
// "Provably compliant" — puur omdat de generieke woorden "vloer"/"armatuur"
// toevallig 8 producten fuzzy raakten. Lw003/Lw101 in hetzelfde boek hebben
// exact hetzelfde profiel (merk null, specs leeg) maar hun producttekst
// ("Maatwerk wandarmatuur") raakte toevallig NIETS → 0 kandidaten → rood via
// stap 4. Dat "rood" was dus zelf toeval van de fuzzy-zoektocht, geen doordacht
// oordeel — de stap 1b-guard behandelt alle vier nu gelijk: open, nooit groen.
test('vacuous green: geen merk + geen specs, mét kandidaten gevonden → open, nooit groen (Lf902)', async () => {
  const db = await createTestDb();
  // Zelfde soort accessoire als de live-check: matcht fuzzy op "armatuur", geen
  // van de gevraagde specs bestaat (er wordt er ook geen gevraagd).
  await seedBrandProduct(db, { brand: "Generiek", name: "Vloer armatuur grondpen" });
  const out = await evaluateSpecLine(
    db,
    req({
      productText:
        "Vloer armatuur nabij taakgebieden voor verhoogde verlichtingssterkte en gelijkmatigheid",
    }),
  );
  expect(out.status).toBe("open");
  expect(out.reason).toMatch(/te weinig gevraagd/);
  // De "Provably compliant"-lijst mag NOOIT de vondst van de fuzzy-zoektocht
  // tonen als bewijs van gelijkwaardigheid — er was niets te bewijzen.
  expect(out.provable).toHaveLength(0);
  expect(out.incomplete).toHaveLength(0);
});

// Gat A (live-check 20 jul, dossier ae0eead9, vier XAL-regels): deze test pinde
// eerder de non-goal van c2121a3 vast ("merk-only blijft WEL groen"). De live-
// check weerlegde die aanname: het merk is bij fetchCandidates een ZOEKFILTER,
// geen getoetste eis — een kandidaat van het juiste merk bewijst alleen dat het
// merk klopt, niet dat het product gelijkwaardig is. Vier XAL-regels stonden zo
// groen met montagerails (token-match op "WALL") als "Provably compliant" —
// dezelfde vacuous truth als Lf902, alleen met een geslaagde merkfilter ervoor.
// Nieuw contract: specloos → kandidaten hooguit lijst 2, status open; de
// kandidaten blijven zichtbaar (niets stilzwijgend weg — de reviewer kiest).
test("vacuous green: merk-only (géén specs) → open met lijst 2-kandidaten, nooit groen", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const out = await evaluateSpecLine(db, req({ brandText: "XAL" }));
  expect(out.status).toBe("open");
  expect(out.reason).toMatch(/geen toetsbare specs/);
  expect(out.provable).toHaveLength(0);
  expect(out.incomplete.length).toBeGreaterThan(0);
  expect(out.unambiguousYellow).toBeUndefined();
});

// Grensbewaking: mét minstens één toetsbare spec verandert er NIETS — een merk
// + kelvin-match blijft gewoon groen (spiegel van de stap 1b-grens in c2121a3).
test("grens: merk + één getoetste spec (kelvin exact) blijft groen", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100", kelvin: 3000 });
  const out = await evaluateSpecLine(
    db,
    req({ brandText: "XAL", specs: { kelvin: 3000 } }),
  );
  expect(out.status).toBe("groen");
  expect(out.provable.length).toBeGreaterThan(0);
});
