// De driver-waarschuwing rust op één afgeleid feit: voert dit merk losse onderdelen?
//
// Twee dingen worden hier bewaakt, en het tweede is het belangrijkste:
//  1. de drempel (≥3) en de afbakening per merk;
//  2. ⚠️ dat de TypeScript-regex en de Postgres-regex op dezelfde namen hetzelfde zeggen.
//     In Postgres' ARE is `\b` géén woordgrens maar het backspace-teken; één letterlijke
//     `regex.source` in een `~*` zou dus stilzwijgend iets anders matchen dan de code die
//     ernaast draait. Zo'n verschil is met het oog niet te zien en met een fixture wél.
import { expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { addProductToBrand, createTestDb, seedBrandProduct } from "@/db/test-db";
import { isLosOnderdeel, onderdeelPatroonSql } from "@/lib/onderdeel-signaal";
import { merkenMetLosseOnderdelen } from "@/lib/repo/onderdeel-merken";

// Namen uit de meting van 30 jul (lib/enrichment/verdenking.ts, ONDERDEEL_START) plus de
// tegenvoorbeelden die de niet-verankerde variant destijds ten onrechte vlagde.
const ONDERDELEN = [
  "POW.SUPPLY SURF. 96W BK END ZEROTRACK PR",
  "ALIM.LED 30W 700mA",
  "ALIMENTATORE DC 20W",
  "DRIVER D4 60W DALI",
  "CONVERTER 24V 100W",
  "TRAFO 105VA",
  "TRANSF ALED-8W",
  "NETZTEIL 24V",
  "EQUIPO DC 20W 500mA",
  "REMOTE KIT GLOWING TR",
  "VOEDING 24V 60W",
  "POWER FEED LEFT BLACK",
  "LED POWER SUPPLY 40W",
];

const ARMATUREN = [
  "Esprit floor, driver incl., carrara",
  "SASSO 100 SQ SP CEIL 17,9W cob LED 2700K",
  "SNOOT FOR SASSO 100",
  "Mito Sospeso 40 up driver",
  "LYD Wall Front IP44",
  "Tolomeo mini transformer stand", // 'transformer' middenin: geen los onderdeel
];

test("de Postgres-regex en de TypeScript-regex zeggen hetzelfde over dezelfde namen", async () => {
  const db = await createTestDb();
  const patroon = onderdeelPatroonSql();
  const namen = [...ONDERDELEN, ...ARMATUREN];

  const res = await db.execute(
    sql`select naam, (naam ~* ${patroon}) as treffer
        from unnest(${sql.raw(`array[${namen.map((n) => `'${n.replaceAll("'", "''")}'`).join(",")}]`)}) as naam`,
  );
  const rows = (
    Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
  ) as { naam: string; treffer: boolean }[];
  expect(rows).toHaveLength(namen.length);

  for (const r of rows) {
    expect(
      r.treffer,
      `Postgres en TypeScript verschillen van mening over "${r.naam}"`,
    ).toBe(isLosOnderdeel(r.naam));
  }
  // En het is geen alles-false-vs-alles-false: beide kanten moeten écht iets zeggen.
  expect(rows.filter((r) => r.treffer)).toHaveLength(ONDERDELEN.length);
});

test("een merk telt pas mee vanaf drie losse onderdelen", async () => {
  const db = await createTestDb();
  // Drie onderdelen → wél. De drempel bestaat omdat één treffer een parse-artefact kan zijn.
  const veel = await seedBrandProduct(db, {
    brand: "Wever & Ducré",
    name: "DRIVER D4 60W DALI",
  });
  await addProductToBrand(db, {
    brandId: veel.brandId,
    priceListId: veel.priceListId,
    name: "CONVERTER 24V 100W",
  });
  await addProductToBrand(db, {
    brandId: veel.brandId,
    priceListId: veel.priceListId,
    name: "POWER FEED LEFT BLACK",
  });
  await addProductToBrand(db, {
    brandId: veel.brandId,
    priceListId: veel.priceListId,
    name: "Box 1.0 LED recessed",
  });

  // Twee onderdelen → net niet.
  const weinig = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "TRAFO 105VA",
  });
  await addProductToBrand(db, {
    brandId: weinig.brandId,
    priceListId: weinig.priceListId,
    name: "NETZTEIL 24V",
  });

  // Geen enkel onderdeel → nooit.
  await seedBrandProduct(db, { brand: "Flos", name: "Esprit floor, driver incl." });

  const uitkomst = await merkenMetLosseOnderdelen(db, [
    "Wever & Ducré",
    "Kreon",
    "Flos",
  ]);
  expect([...uitkomst]).toEqual(["Wever & Ducré"]);
});

test("alleen de gevraagde merken komen terug, en een lege vraag raakt de database niet", async () => {
  const db = await createTestDb();
  const wd = await seedBrandProduct(db, { brand: "Wever & Ducré", name: "DRIVER D4" });
  for (const naam of ["CONVERTER 24V", "TRAFO 105VA"]) {
    await addProductToBrand(db, {
      brandId: wd.brandId,
      priceListId: wd.priceListId,
      name: naam,
    });
  }

  // Het merk voert onderdelen, maar er is niet naar gevraagd → niet in de uitkomst.
  expect([...(await merkenMetLosseOnderdelen(db, ["Flos"]))]).toEqual([]);
  expect([...(await merkenMetLosseOnderdelen(db, []))]).toEqual([]);
  expect([...(await merkenMetLosseOnderdelen(db, [null, undefined, ""]))]).toEqual([]);
  expect([...(await merkenMetLosseOnderdelen(db, ["Wever & Ducré"]))]).toEqual([
    "Wever & Ducré",
  ]);
});

test("het signaal kijkt naar de catalogus, niet naar de zichtbaarheid", async () => {
  // Bewust: de vraag is "wát voert dit merk", niet "wat kunnen we vandaag offreren". Een
  // merk waarvan de prijslijst verlopen is voert nog steeds dezelfde drivers, en juist bij
  // zo'n merk sta je op het punt te bellen — dan is dit precies de vraag die erbij hoort.
  const db = await createTestDb();
  const wd = await seedBrandProduct(db, {
    brand: "Lombardo",
    name: "DRIVER D4 60W",
    validFrom: "2020-01-01",
    validUntil: "2020-12-31",
  });
  for (const naam of ["CONVERTER 24V", "TRAFO 105VA"]) {
    await addProductToBrand(db, {
      brandId: wd.brandId,
      priceListId: wd.priceListId,
      name: naam,
    });
  }
  expect([...(await merkenMetLosseOnderdelen(db, ["Lombardo"]))]).toEqual(["Lombardo"]);
});
