// Reparatie 30 jul, bevinding 8: de datumformatters pinden geen tijdzone en volgden dus de
// tijdzone van het proces. Lokaal is dat Europe/Amsterdam, op Vercel UTC — een event van
// 11:00 stond in productie als "09:00" op het scherm. Deze tests draaien daarom op vaste
// momenten en horen te slagen onder ELKE TZ; `TZ=UTC bun vitest run lib/format.test.ts` is
// de echte test, niet een variant ervan.
import { expect, test } from "vitest";
import { formatDate, formatDateTime, formatEur, formatInt } from "./format";

test("formatDateTime rendert Europe/Amsterdam, niet de tijdzone van het proces", () => {
  // Zomertijd (CEST, UTC+2): 09:00Z is 11:00 in Nederland. Onder TZ=UTC gaf dit "09:00".
  expect(formatDateTime("2026-07-06T09:00:00Z")).toBe("06 Jul 2026, 11:00");
  // Wintertijd (CET, UTC+1) én over de datumgrens heen: 23:30Z op 15 jan is 00:30 op 16 jan.
  expect(formatDateTime("2026-01-15T23:30:00Z")).toBe("16 Jan 2026, 00:30");
});

// Zelfde meting, maar zonder de verwachting met de hand uit te rekenen: als de formatter
// ooit weer de proces-tijdzone gaat volgen, loopt dit uiteen zodra de suite niet in
// Amsterdam draait.
test("formatDateTime is identiek aan een expliciet op Amsterdam gepinde formatter", () => {
  const pinned = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Amsterdam",
  });
  const instant = "2026-07-06T09:00:00Z";
  expect(formatDateTime(instant)).toBe(pinned.format(new Date(instant)));
});

// De latente val die de verificatie vond: price_lists.valid_until, quotes.quote_date en
// manual_price_valid_until zijn `date()`-kolommen. Zo'n waarde heeft geen tijdstip en dus
// geen zone; door een zone-gepinde formatter halen kan er een dag naast zitten.
test("formatDate leest een kale kalenderdatum zoals hij er staat", () => {
  expect(formatDate("2026-07-06")).toBe("06 Jul 2026");
  expect(formatDate("2026-01-01")).toBe("01 Jan 2026");
  // Ook de randgevallen: eerste en laatste dag van het jaar schuiven niet.
  expect(formatDate("2025-12-31")).toBe("31 Dec 2025");
});

test("formatDate met een echt tijdstip volgt dezelfde zone als formatDateTime", () => {
  // 22:30Z op 5 juli is in Nederland al 6 juli (00:30 CEST).
  expect(formatDate("2026-07-05T22:30:00Z")).toBe("06 Jul 2026");
});

test("lege en onleesbare invoer wordt een streepje, geen 'Invalid Date'", () => {
  expect(formatDate(null)).toBe("—");
  expect(formatDate("")).toBe("—");
  expect(formatDate("geen datum")).toBe("—");
  expect(formatDateTime(undefined)).toBe("—");
  expect(formatDateTime("geen datum")).toBe("—");
});

// De locale-regel (besluit 30 jul, zie de toelichting in format.ts en HANDOVER.md):
// getallen en bedragen EU, datums met een geschreven maand.
test("getallen en bedragen blijven EU-conventie", () => {
  expect(formatInt(211317)).toBe("211.317");
  // nl-NL zet een niet-afbrekende spatie achter het euroteken, vandaar  .
  expect(formatEur(265)).toBe("€ 265,00");
});
