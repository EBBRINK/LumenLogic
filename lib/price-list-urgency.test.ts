// De formule uit docs/goal-prijslijst-urgentie.md, getest op de gevallen waar hij vóór
// bestond: het Vesoi-geval (lang verlopen, niemand vraagt ernaar) en het merk zonder lijst.
import { describe, expect, test } from "vitest";
import {
  demandScore,
  GEEN_VRAAG,
  parseUrgencyQuery,
  PRICE_LISTS_PATH,
  sortUrgencyRows,
  timeFactor,
  urgencyHref,
  urgencyReason,
  urgencyScore,
  type BrandDemandSignals,
  type BrandUrgencyRow,
} from "./price-list-urgency";

function rij(over: Partial<BrandUrgencyRow> = {}): BrandUrgencyRow {
  return {
    brandId: "b1",
    brandName: "Merk",
    brandCode: null,
    lifecycle: "actief",
    priceListId: "pl1",
    priceListName: "Prijslijst",
    validUntil: "2026-09-01",
    daysLeft: 12,
    replacedAt: null,
    priceCount: 40,
    productCount: 40,
    demand: { ...GEEN_VRAAG },
    ...over,
  };
}

function vraag(over: Partial<BrandDemandSignals>): BrandDemandSignals {
  return { ...GEEN_VRAAG, ...over };
}

describe("tijdfactor", () => {
  test("een geldige lijst ver vooruit ligt op de bodem, en die is niet nul", () => {
    // Nul zou de hele staart van rustige merken op urgentie 0 zetten; dan bepaalt de
    // vraagscore onderin de lijst niets meer.
    expect(timeFactor(rij({ daysLeft: 180 }))).toBeCloseTo(0.1, 5);
    expect(timeFactor(rij({ daysLeft: 90 }))).toBeCloseTo(0.1, 5);
  });

  test("loopt op vanaf 90 dagen vóór verval en piekt op 0,70 op de dag zelf", () => {
    expect(timeFactor(rij({ daysLeft: 45 }))).toBeCloseTo(0.4, 5);
    expect(timeFactor(rij({ daysLeft: 0 }))).toBeCloseTo(0.7, 5);
  });

  test("stijgt na verval nog licht door en vlakt daarna af", () => {
    expect(timeFactor(rij({ daysLeft: -45 }))).toBeCloseTo(0.85, 5);
    expect(timeFactor(rij({ daysLeft: -90 }))).toBeCloseTo(1, 5);
    // Het aftoppen: een jaar verlopen is niet zesentwintig keer erger dan twee weken.
    expect(timeFactor(rij({ daysLeft: -365 }))).toBeCloseTo(1, 5);
  });

  test("een merk zonder prijslijst krijgt het maximum", () => {
    const zonder = rij({ priceListId: null, validUntil: null, daysLeft: null, priceCount: 0 });
    expect(timeFactor(zonder)).toBe(1);
  });

  test("een geldige lijst zonder prijsregels is hetzelfde gat (ijzeren regel 3)", () => {
    expect(timeFactor(rij({ daysLeft: 178, priceCount: 0 }))).toBe(1);
  });
});

describe("vraagscore", () => {
  test("zonder enig signaal is hij 1, zodat de tijdfactor de volgorde houdt", () => {
    expect(demandScore(GEEN_VRAAG)).toBe(1);
  });

  test("projecten wegen zwaarder dan productregels", () => {
    const projecten = demandScore(vraag({ projects12m: 4 }));
    const regels = demandScore(vraag({ lines12m: 4 }));
    expect(projecten).toBeGreaterThan(regels);
  });

  test("logaritmisch: één enorm project overheerst de lijst niet", () => {
    const klein = demandScore(vraag({ lines12m: 10 }));
    const enorm = demandScore(vraag({ lines12m: 1000 }));
    // 100× zoveel regels, maar geen 100× zoveel score.
    expect(enorm).toBeLessThan(klein * 3);
    expect(enorm).toBeGreaterThan(klein);
  });

  test("elk signaal telt mee — geen enkele blijft stil op nul staan", () => {
    const sleutels: (keyof BrandDemandSignals)[] = [
      "projects12m",
      "lines12m",
      "searches12m",
      "requestedNotInCatalogue",
      "loadQueueDemand",
      "unmetDemand12m",
      "considered12m",
      "chosen12m",
    ];
    for (const sleutel of sleutels) {
      expect(demandScore(vraag({ [sleutel]: 5 }))).toBeGreaterThan(1);
    }
  });
});

describe("urgentie", () => {
  test("het Vesoi-geval: druk merk dat bijna verloopt gaat vóór stil merk dat lang verlopen is", () => {
    const vesoi = rij({
      brandName: "Vesoi",
      daysLeft: -365,
      demand: { ...GEEN_VRAAG },
    });
    const druk = rij({
      brandName: "Delta Light",
      daysLeft: 12,
      demand: vraag({ projects12m: 28, lines12m: 140 }),
    });
    expect(urgencyScore(druk)).toBeGreaterThan(urgencyScore(vesoi));
  });

  test("bij gelijke vraag wint het merk zonder prijslijst", () => {
    const zonder = rij({ priceListId: null, daysLeft: null, validUntil: null, priceCount: 0 });
    const met = rij({ daysLeft: 12 });
    expect(urgencyScore(zonder)).toBeGreaterThan(urgencyScore(met));
  });

  test("bij gelijke tijd wint het merk met meer vraag", () => {
    const stil = rij({ daysLeft: 12 });
    const druk = rij({ daysLeft: 12, demand: vraag({ projects12m: 28 }) });
    expect(urgencyScore(druk)).toBeGreaterThan(urgencyScore(stil));
  });
});

describe("reden", () => {
  test("noemt de tijd én de vraag", () => {
    expect(urgencyReason(rij({ daysLeft: 12, demand: vraag({ projects12m: 28 }) }))).toBe(
      "expires in 12 days · 28 projects",
    );
  });

  test("verlopen leest als verlopen, niet als een negatief aantal dagen", () => {
    expect(urgencyReason(rij({ daysLeft: -36, demand: vraag({ projects12m: 1 }) }))).toBe(
      "expired 36 days ago · 1 project",
    );
  });

  test("geen lijst is de sterkste reden die er is", () => {
    const zonder = rij({ priceListId: null, daysLeft: null, validUntil: null, priceCount: 0 });
    expect(urgencyReason(zonder)).toBe("no price list");
  });

  test("een geldige lijst zonder prijsregels zegt dat, en niet 'geldig'", () => {
    expect(urgencyReason(rij({ daysLeft: 178, priceCount: 0 }))).toBe("price list has 0 products");
  });

  test("zonder vraagsignaal blijft de tijdhelft over — geen verzonnen '0 projects'", () => {
    expect(urgencyReason(rij({ daysLeft: 12 }))).toBe("expires in 12 days");
  });

  test("valt terug op zoekopdrachten als er geen projecten zijn", () => {
    expect(urgencyReason(rij({ daysLeft: 12, demand: vraag({ searches12m: 9 }) }))).toBe(
      "expires in 12 days · 9 searches",
    );
  });
});

describe("sorteren", () => {
  const zonder = rij({ brandId: "z", brandName: "Zonder", priceListId: null, daysLeft: null, validUntil: null, priceCount: 0 });
  const bijna = rij({ brandId: "a", brandName: "Bijna", daysLeft: 12, demand: vraag({ projects12m: 28, lines12m: 140 }) });
  const lang = rij({ brandId: "v", brandName: "Vesoi", daysLeft: -365 });
  const rijen = [lang, bijna, zonder];

  test("default is urgentie, aflopend", () => {
    const q = parseUrgencyQuery({});
    expect(q.sort).toBe("urgency");
    // Let op de volgorde van de laatste twee: het merk ZONDER lijst heeft de maximale
    // tijdfactor, maar urgentie is een product — een merk dat in 28 projecten zit en over
    // 12 dagen verloopt gaat er alsnog overheen. Dat is precies het punt van de formule;
    // bij gelijke vraag wint het merk zonder lijst wél (eigen test hierboven).
    expect(sortUrgencyRows(rijen, q).map((r) => r.brandId)).toEqual(["a", "v", "z"]);
  });

  test("op dagen sorteren geeft de oude volgorde terug: het langst verlopen bovenaan", () => {
    const q = parseUrgencyQuery({ sort: "days" });
    // Een merk zonder lijst heeft geen dagen; die hoort niet stil bovenaan te belanden
    // omdat null als 0 leest — hij staat achteraan, waar de kolom niets over hem zegt.
    expect(sortUrgencyRows(rijen, q).map((r) => r.brandId)).toEqual(["v", "a", "z"]);
  });

  test("dezelfde kolom nog eens draait de richting om", () => {
    const q = parseUrgencyQuery({ sort: "projects", dir: "asc" });
    expect(sortUrgencyRows(rijen, q).map((r) => r.brandId)).toEqual(["v", "z", "a"]);
  });

  test("een onzinnige sorteersleutel uit de adresbalk valt terug op de default", () => {
    expect(parseUrgencyQuery({ sort: "drop table", dir: "zijwaarts" })).toEqual({
      sort: "urgency",
      dir: "desc",
    });
  });

  test("de href laat de default weg en zet een tweede klik op dezelfde kolom om", () => {
    const q = parseUrgencyQuery({});
    expect(urgencyHref(q, "urgency")).toBe(`${PRICE_LISTS_PATH}?sort=urgency&dir=asc`);
    expect(urgencyHref(q, "days")).toBe(`${PRICE_LISTS_PATH}?sort=days&dir=asc`);
    expect(urgencyHref(parseUrgencyQuery({ sort: "days", dir: "asc" }), "urgency")).toBe(
      PRICE_LISTS_PATH,
    );
  });

  test("het basispad komt van buiten — dit scherm verhuist naar Brand Management", () => {
    // De module kent geen routes; wie hem gebruikt geeft zijn eigen pad mee. Zo kost de
    // verhuizing één page-bestand en geen enkele regel hier.
    expect(urgencyHref(parseUrgencyQuery({}), "days", "/brand-management")).toBe(
      "/brand-management?sort=days&dir=asc",
    );
  });
});
