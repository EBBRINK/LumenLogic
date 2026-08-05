// De dagprijsregel (I-04) + de VERVALREGEL (reviewzwerm A7), rechtstreeks op de pure
// functie. Waarom hier en niet alleen via de fixtures: `unitPriceOf` is de énige plek
// waar "welke prijs telt" beantwoord wordt, en die vraag beslist wat er als bedrag op
// een klantstuk komt. De grensgevallen (vandaag = laatste geldige dag, geen vervaldatum,
// geen catalogusprijs om op terug te vallen) horen op de functie zelf gepind, niet
// alleen op één toevallige seed.
//
// `today` gaat er als tweede argument in, zodat deze tests niet omvallen zodra de
// kalender verschuift.
import { expect, test } from "vitest";
import { todayIso, unitPriceOf } from "./day-price";

const TODAY = "2026-09-15";

// Eén regelvorm, zodat elk geval alleen verschilt in wat het wíl testen.
function line(over: {
  manualPrice?: string | null;
  matchedPrice?: string | null;
  manualPriceValidUntil?: string | null;
}) {
  return {
    manualPrice: over.manualPrice ?? null,
    matchedPrice: over.matchedPrice ?? null,
    manualPriceValidUntil: over.manualPriceValidUntil ?? null,
  };
}

test("I-04 blijft: een GELDIGE dagprijs wint van de catalogusprijs", () => {
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: "226.00",
        manualPriceValidUntil: "2026-12-31",
      }),
      TODAY,
    ),
  ).toEqual({
    unitPrice: "199.00",
    source: "dagprijs",
    dayPriceExpiredOn: null,
  });
});

// HET GEVAL VAN A7. De calculator zet in mei een dagprijs van €199, geldig t/m 30 juni.
// In september stond die €199 nog steeds op het scherm, op de PDF en in de XIS-export.
test("A7: een VERLOPEN dagprijs valt terug op de catalogusprijs, mét merkteken", () => {
  const gekozen = unitPriceOf(
    line({
      manualPrice: "199.00",
      matchedPrice: "226.00",
      manualPriceValidUntil: "2026-06-30",
    }),
    TODAY,
  );
  expect(gekozen).toEqual({
    unitPrice: "226.00",
    source: "catalogus",
    dayPriceExpiredOn: "2026-06-30",
  });
  // De verouderde €199 komt nergens meer uit deze functie.
  expect(gekozen.unitPrice).not.toBe("199.00");
  // …en de herkomst zegt "catalogus", zodat de offerte er wél een prijslijst aan hangt
  // (generateQuote leest exact dit veld).
  expect(gekozen.source).toBe("catalogus");
});

// De grens, exact als bij ijzeren regel 3 (`valid_until >= CURRENT_DATE`): een dagprijs
// die tot vandaag geldig is, is vandaag nog geldig. Eén dag verkeerd afronden betekent
// hier dat een geldige prijs van het klantstuk verdwijnt óf een verlopen prijs erop blijft.
test("A7-grens: valid_until is INCLUSIEF — vandaag geldig, gisteren verlopen", () => {
  const vandaag = unitPriceOf(
    line({
      manualPrice: "199.00",
      matchedPrice: "226.00",
      manualPriceValidUntil: TODAY,
    }),
    TODAY,
  );
  expect(vandaag.unitPrice).toBe("199.00");
  expect(vandaag.source).toBe("dagprijs");
  expect(vandaag.dayPriceExpiredOn).toBeNull();

  // Precies één dag eerder: verlopen.
  const gisteren = unitPriceOf(
    line({
      manualPrice: "199.00",
      matchedPrice: "226.00",
      manualPriceValidUntil: "2026-09-14",
    }),
    TODAY,
  );
  expect(gisteren.unitPrice).toBe("226.00");
  expect(gisteren.dayPriceExpiredOn).toBe("2026-09-14");

  // En morgen is hij natuurlijk gewoon geldig.
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: "226.00",
        manualPriceValidUntil: "2026-09-16",
      }),
      TODAY,
    ).unitPrice,
  ).toBe("199.00");
});

// De bestaande semantiek van setDayPrice: geen datum meegegeven = geen vervaldatum. Die
// verandert met A7 níet — anders zou elke bestaande dagprijs in de database ineens
// verlopen zijn.
test("A7: validUntil = null verloopt nooit", () => {
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: "226.00",
        manualPriceValidUntil: null,
      }),
      TODAY,
    ),
  ).toEqual({
    unitPrice: "199.00",
    source: "dagprijs",
    dayPriceExpiredOn: null,
  });
});

// Het eerlijke gat: verlopen dagprijs, geen catalogus. Dan géén prijs — nooit stiekem
// het oude bedrag, en nooit een verzonnen 0. Het merkteken staat er wél, zodat het
// klantstuk uitlegt waarom die regel leeg is.
test("A7: verlopen dagprijs zónder catalogusprijs → geen prijs, wél merkteken", () => {
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: null,
        manualPriceValidUntil: "2026-06-30",
      }),
      TODAY,
    ),
  ).toEqual({
    unitPrice: null,
    source: null,
    dayPriceExpiredOn: "2026-06-30",
  });
});

test("zonder dagprijs verandert er niets: catalogus, of helemaal geen prijs", () => {
  expect(unitPriceOf(line({ matchedPrice: "226.00" }), TODAY)).toEqual({
    unitPrice: "226.00",
    source: "catalogus",
    dayPriceExpiredOn: null,
  });
  expect(unitPriceOf(line({}), TODAY)).toEqual({
    unitPrice: null,
    source: null,
    dayPriceExpiredOn: null,
  });
  // Een vervaldatum zónder dagprijs is geen verlopen dagprijs — er wás niets om te
  // laten verlopen, dus het klantstuk krijgt hier ook geen merkteken.
  expect(
    unitPriceOf(
      line({ matchedPrice: "226.00", manualPriceValidUntil: "2020-01-01" }),
      TODAY,
    ),
  ).toEqual({
    unitPrice: "226.00",
    source: "catalogus",
    dayPriceExpiredOn: null,
  });
});

// De default van `today`: de echte dag, in UTC-vorm — dezelfde conventie als addDays in
// lib/repo/dossiers.ts en als de `date`-kolommen zelf. Zonder dit zou een lokale
// tijdzone er een dag naast kunnen schieten, precies op de grens hierboven.
test("today-default: UTC 'YYYY-MM-DD', en dat is wat unitPriceOf zonder argument gebruikt", () => {
  expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(todayIso()).toBe(new Date().toISOString().slice(0, 10));

  // Ver in het verleden verlopen → catalogus, ook zonder injectie.
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: "226.00",
        manualPriceValidUntil: "2020-01-01",
      }),
    ).unitPrice,
  ).toBe("226.00");
  // Ver in de toekomst → dagprijs.
  expect(
    unitPriceOf(
      line({
        manualPrice: "199.00",
        matchedPrice: "226.00",
        manualPriceValidUntil: "2999-12-31",
      }),
    ).unitPrice,
  ).toBe("199.00");
});
