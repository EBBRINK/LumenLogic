// Regressietoetsen voor de skill-lokale patches op parserversie 9786dc5.
//
// Elke test hieronder is een ECHTE naam uit de nachtrun van 11 aug 2026 (10 merken, 134.909
// rijen). De merk- en aantalvermelding per blok is geen versiering: hij zegt hoe vaak de fout
// werkelijk voorkwam, zodat een latere lezer weet wat het kost om de regel terug te draaien.
//
// Draaien: bun test scripts/parser.test.ts   (vanuit prijslijst/)

import { expect, test, describe } from "bun:test";
import { unlink } from "node:fs/promises";
import { parseProductName } from "./parser";
import { verdenkingen } from "./verdenking";

const soorten = (naam: string) =>
  verdenkingen(naam, parseProductName(naam)).map((v) => `${v.veld}:${v.soort}`);

describe("Ta = omgevingstemperatuur, geen bundelhoek (iGuzzini, 1.708 rijen)", () => {
  test("Ta 50° levert geen beamAngle", () => {
    expect(parseProductName("Laser Blade XS Ta 50° 2700K").beamAngle).toBeUndefined();
  });

  test("Ta50° zonder spatie ook niet", () => {
    expect(parseProductName("Palco InOut Ta50° 3000K").beamAngle).toBeUndefined();
  });

  test("een echte bundelhoek in dezelfde naam blijft staan", () => {
    expect(parseProductName("Palco 24° spotlight Ta 50° 3000K").beamAngle).toBe(24);
  });

  test("een gewone bundelhoek blijft ongemoeid", () => {
    expect(parseProductName("Laser Blade 36° 3000K").beamAngle).toBe(36);
  });
});

describe("lumen per meter is geen productwaarde (Modular, 72 rijen)", () => {
  test("1000lm/m levert geen lumenOutput", () => {
    expect(parseProductName("LED strip 24V 1000lm/m 2700K").lumenOutput).toBeUndefined();
  });

  test("met spaties eromheen ook niet", () => {
    expect(parseProductName("LEDstrip 800 lm / m 3000K").lumenOutput).toBeUndefined();
  });

  test("een totaal in dezelfde naam blijft wel staan", () => {
    expect(parseProductName("LEDstrip 2m 1000lm/m totaal 2000lm").lumenOutput).toBe(2000);
  });

  test("een gewone lumenwaarde blijft ongemoeid", () => {
    expect(parseProductName("Downlight 1200lm 3000K").lumenOutput).toBe(1200);
  });
});

describe("drie-punts-bereik is een bereik (RZB)", () => {
  test("3400...4300 lm wordt als bereik verdacht", () => {
    expect(soorten("SIDELITE ECO, 29...38 W, 3400...4300 lm, 830, wit, DALI")).toContain(
      "lumenOutput:bereik",
    );
  });

  test("streepje-bereik in lumen telt ook", () => {
    expect(soorten("PANEL 3400-4300 lm 3000K")).toContain("lumenOutput:bereik");
  });

  test("kelvin met drie punten telt ook", () => {
    expect(soorten("SIDELITE 2700...4000 K wit")).toContain("kelvin:bereik");
  });

  test("29...38 W is een vermogensbereik, geen 38 W", () => {
    // Subtieler dan de andere twee: alleen ná de 38 staat een W, dus er is maar één
    // wattkandidaat en `meerdere-waarden` zwijgt. Zonder eigen bereiktoets landt de bovengrens.
    expect(soorten("SIDELITE ECO, 29...38 W, 3400...4300 lm, 830, wit, DALI")).toContain(
      "maxWattage:bereik",
    );
  });

  test("6/9W blijft ongemoeid — dat is een tweede uitvoering, geen bereik", () => {
    expect(soorten("SNEAK CEILING REC 1.0 6/9W 350mA")).not.toContain("maxWattage:bereik");
  });

  test("een lengtemaat vóór een wattage is geen bereik", () => {
    expect(soorten("RAIL 1200-1650 mm 12W")).not.toContain("maxWattage:bereik");
  });

  test("iGuzzini's streepjes-veldscheiding is geen wattbereik (433 goede waarden)", () => {
    // Gemeten valse positief: een streepje-variant van de wattregel sloopte hier het juiste
    // vermogen, want `L=1372 - 11W` is een lengte plus een vermogen, geen bereik.
    //
    // De naam staat er VOLLEDIG, inclusief de staart "- Colour: White/White". Een ingekorte
    // versie eindigt op "CRI 90" en dán vuurt `afgekapt` — die is wél onderdrukkend, zodat de
    // test groen zou staan om de verkeerde reden.
    const naam =
      "Superrail DALI Powerline system Module for Superrail 48V track - BLE Casambi  - " +
      "UGR<19 - L=1372 - 11W 1428lm - 3000K - CRI 90 - Colour: White/White Tr";
    // Geen énkele ONDERDRUKKENDE vlag op het wattage — dat is wat de 433 waarden redt.
    expect(soorten(naam)).not.toContain("maxWattage:bereik");
    expect(soorten(naam)).not.toContain("maxWattage:afgekapt");
    expect(parseProductName(naam).maxWattage).toBe(11);
    // Wel terecht: de naam draagt DALI én Casambi, en onze kolom houdt er maar één vast.
    expect(soorten(naam)).toContain("dimmable:meerdere-protocollen");
  });

  test("een enkele lumenwaarde is geen bereik", () => {
    expect(soorten("PANEL 4300 lm 3000K")).not.toContain("lumenOutput:bereik");
  });

  test("een maat vóór de lumen is geen bereik", () => {
    // "1200-1650" is een lengtemaat; de lumen staat er los achter.
    expect(soorten("RAIL 1200-1650 mm 2000 lm")).not.toContain("lumenOutput:bereik");
  });
});

describe("CASAMBI en trailing edge zijn dimprotocollen (Modular, 70 + 491 rijen)", () => {
  test("Casambi los wordt herkend", () => {
    expect(parseProductName("Smart Surface 82 Casambi 2700K").dimmable).toBe("CASAMBI");
  });

  test("Casambi (DALI) blijft DALI, conform de woordenschat", () => {
    expect(parseProductName("Smart Surface CASAMBI (DALI) 3000K").dimmable).toBe("DALI");
  });

  test("Trailing Edge valt in de TRIAC/PHASE-familie", () => {
    expect(parseProductName("Lotis 86 Trailing Edge 2700K").dimmable).toBe("PHASE");
  });

  test("een ontkenning wint nog steeds van alles", () => {
    expect(parseProductName("Connector NON DIM Casambi").dimmable).toBeUndefined();
  });
});

describe("onderdeel midden in de naam wordt gevlagd (Modular, Vibia, Artemide)", () => {
  test("Controller midden in de naam", () => {
    expect(soorten("Smart Surface 82 Controller 48W")).toContain("maxWattage:onderdeel-in-naam");
  });

  test("connector-track", () => {
    expect(soorten("SURF.ELECT.CONN.TRACK 48W BIN")).toContain("maxWattage:onderdeel-in-naam");
  });

  test("POWER KIT midden in de naam", () => {
    expect(soorten("A.24 C POWER KIT 150W")).toContain("maxWattage:onderdeel-in-naam");
  });

  test("een gewoon armatuur wordt niet gevlagd", () => {
    expect(soorten("Lotis 86 IP44 12W 2700K")).not.toContain("maxWattage:onderdeel-in-naam");
  });

  test("de vlag onderdrukt de waarde niet — hij maakt hem zichtbaar", () => {
    expect(parseProductName("Smart Surface 82 Controller 48W").maxWattage).toBe(48);
  });
});

describe("een maat vóór een kelvin is geen bereik (iGuzzini, 748 rijen)", () => {
  test("Ø 163 - 4000K levert gewoon 4000 K op", () => {
    const naam = "Easy Ø 163 - 4000K - CRI80 - UGR<19 10.3W 1335lm - 4000K - DALI-2";
    expect(soorten(naam)).not.toContain("kelvin:bereik");
    expect(parseProductName(naam).kelvin).toBe(4000);
  });

  test("tunable white blijft wél een bereik", () => {
    expect(soorten("STRIP TW 2700-6500K 24V")).toContain("kelvin:bereik");
  });

  test("twee kelvins met elk een K blijven een bereik", () => {
    expect(soorten("Mori 140 LED BWL 3000K/4000K structuur zwart")).toContain("kelvin:bereik");
  });

  test("Nordlux' 3000/4000K blijft een bereik — het eerste getal is zelf een kelvin", () => {
    expect(soorten("Oja 29 3000/4000K Ceiling light")).toContain("kelvin:bereik");
  });

  test("dim-to-warm 1800-3000K blijft een bereik (Modular, 701 rijen)", () => {
    // 1800 K is de onderkant van warm dim; met een ondergrens van 2000 zou deze rij ten
    // onrechte gewoon 3000 K opleveren. Let op: `WD` staat niet in de TUNABLE-lijst, dus
    // deze bereiktoets is hier het enige vangnet.
    const naam = "M-LED Module 50 1x LED 1800-3000K WD Spot DE Aluminium Brushed Anodised";
    expect(soorten(naam)).toContain("kelvin:bereik");
  });
});

describe("een afmeting aan het eind is geen afgekapte naam (RZB, 9.093 rijen)", () => {
  const rzb =
    "COMFORT LINER SLIM, 13 W, 1050 lm, 840, wit, DALI Plafondarmaturen, D 255 H 34";

  test("de naam wordt niet als afgekapt gevlagd", () => {
    expect(soorten(rzb).filter((s) => s.endsWith(":afgekapt"))).toEqual([]);
  });

  test("en de waarden blijven dus staan", () => {
    const p = parseProductName(rzb);
    expect(p.maxWattage).toBe(13);
    expect(p.lumenOutput).toBe(1050);
    expect(p.dimmable).toBe("DALI");
  });

  test("een echt kaal getal aan het eind blijft wél gevlagd", () => {
    expect(soorten("Cromarty 120 LED BGS 3000K RVS 316")).toContain("kelvin:afgekapt");
  });

  test("een lenshoek aan het eind blijft ook gevlagd — geen maatlabel", () => {
    expect(soorten("EDline 2x LED 2700K Wide Flood DI + Lens 80")).toContain("kelvin:afgekapt");
  });

  test("een naam die op een streepje eindigt blijft afgekapt, ook mét maat", () => {
    expect(soorten("PANEL 12W 3000K D 255 H 34 -")).toContain("kelvin:afgekapt");
  });
});

describe("vastgeplakt wattage in een modelcode (Luceplan 37, Componi-patroon)", () => {
  test("A07S20W wordt gevlagd", () => {
    expect(soorten("Otto Watt A07S20W tafellamp")).toContain("maxWattage:vastgeplakt-wattage");
  });

  test("Componi75W wordt gevlagd", () => {
    expect(soorten("Componi75W wandlamp wit")).toContain("maxWattage:vastgeplakt-wattage");
  });

  test("een los geschreven wattage wordt niet gevlagd", () => {
    expect(soorten("Downlight 12W 3000K")).not.toContain("maxWattage:vastgeplakt-wattage");
  });

  test("de parser leest F13W nog steeds als 13 W — de poort beslist, niet de parser", () => {
    // parseProductName blijft de waarde geven (F13W is een echte T5-buis); pas parse-namen.ts
    // houdt hem tegen, omdat `vastgeplakt-wattage` daar onderdrukkend is. Zo blijft de scheiding
    // intact: de parser leest, de poort beslist wat er landt.
    expect(parseProductName("TL buis F13W").maxWattage).toBe(13);
    expect(soorten("TL buis F13W")).toContain("maxWattage:vastgeplakt-wattage");
  });
});

describe("'Integrated power supply' is een spec, geen product (iGuzzini, 4.291 rijen)", () => {
  const armatuur =
    "Lingotto Floodlight with arm and swivel joint – Warm White – Integrated power supply " +
    "- 28.6W 2960lm - 2200K - DALI-2 - Colour: White";

  test("een armatuur MET voeding wordt niet als onderdeel gevlagd", () => {
    expect(soorten(armatuur).filter((s) => s.endsWith(":product-is-onderdeel"))).toEqual([]);
  });

  test("en houdt dus zijn watt, lumen, kelvin en dimprotocol", () => {
    const p = parseProductName(armatuur);
    expect(p.maxWattage).toBe(28.6);
    expect(p.lumenOutput).toBe(2960);
    expect(p.kelvin).toBe(2200);
    expect(p.dimmable).toBe("DALI");
  });

  test("'DALI dimmable power supply' telt ook als spec", () => {
    const n = "Laser Blade Recessed frame - DALI dimmable power supply - 67.3W 5346lm - 3500K";
    expect(soorten(n).filter((s) => s.endsWith(":product-is-onderdeel"))).toEqual([]);
  });

  test("maar een echte voeding blijft wél een onderdeel", () => {
    expect(soorten("Power supply unit IP67 24V 50W TRIAC")).toContain(
      "maxWattage:product-is-onderdeel",
    );
  });

  test("'base for power supply' blijft ook een onderdeel — 'for' is geen kwalificatie", () => {
    expect(soorten("Libera System Cover base for power supply - with 60W driver")).toContain(
      "maxWattage:product-is-onderdeel",
    );
  });
});

describe("Ta met max/min is nog steeds omgevingstemperatuur (iGuzzini, 8 rijen)", () => {
  test("Ta max 35°C levert geen bundelhoek", () => {
    expect(
      parseProductName("Light Up Floor recessed - Ta max 35°C 46.7W 5233.9lm - 3000K").beamAngle,
    ).toBeUndefined();
  });

  test("een echte hoek blijft staan", () => {
    expect(parseProductName("Palco 24 spotlight 24° 3000K").beamAngle).toBe(24);
  });
});

describe("het ordinaalteken º is ook een bundelhoek (Vibia, 153 rijen)", () => {
  test("SPOTLIGHT 12º levert 12 graden", () => {
    expect(parseProductName("SPOTLIGHT 12º,BLACK ,2700K,CASAMBI P2P").beamAngle).toBe(12);
  });

  test("het gewone gradenteken blijft werken", () => {
    expect(parseProductName("Palco 24° spotlight 3000K").beamAngle).toBe(24);
  });

  test("Ta blijft ook met het ordinaalteken uitgesloten", () => {
    expect(parseProductName("Laser Blade Ta 50º 2700K").beamAngle).toBeUndefined();
  });
});

describe("de plus-notatie is twee lichtmotoren, geen totaal (Intra, 238.602 rijen)", () => {
  const naam = "Trix 4000+1100 lm 44+15 W 830 wit";

  test("watt wordt als deelwaarde gevlagd", () => {
    expect(soorten(naam)).toContain("maxWattage:deelwaarden");
  });

  test("lumen ook", () => {
    expect(soorten(naam)).toContain("lumenOutput:deelwaarden");
  });

  test("een gewone waarde blijft ongemoeid", () => {
    expect(soorten("Panel 3000 lm 30 W")).toEqual([]);
  });

  test("een modelcode met plus is geen deelwaarde — er staat een letter vóór het getal", () => {
    expect(soorten("TL buis T5+ 14W 4000K")).not.toContain("maxWattage:deelwaarden");
  });
});

describe("een diametermaat vóór een losse W is geen wattage (Oty light, 24 rijen)", () => {
  test("Ø32 W levert geen wattage — de W is een uitvoeringsletter", () => {
    expect(parseProductName("POP HOST Ø32 W").maxWattage).toBeUndefined();
  });

  test("MOMA Ø40 W ook niet", () => {
    expect(parseProductName("MOMA Ø40 W").maxWattage).toBeUndefined();
  });

  test("een gewoon wattage met spatie blijft staan", () => {
    expect(parseProductName("Downlight 12 W 3000K").maxWattage).toBe(12);
  });

  test("de bestaande PAR16-regel blijft werken", () => {
    expect(parseProductName("RONY PAR16 W max. 12W GU10").maxWattage).toBe(12);
  });
});

describe("het Duitse duizendtalpunt (Oligo)", () => {
  test("1.700lm is 1700 lumen, geen 700", () => {
    expect(parseProductName("Grace 1.700lm 2700K").lumenOutput).toBe(1700);
  });

  test("12.500 lm is 12500, geen 500", () => {
    expect(parseProductName("Panel 12.500 lm 4000K").lumenOutput).toBe(12500);
  });

  test("een gewone lumenwaarde blijft ongemoeid", () => {
    expect(parseProductName("Strip 1700lm").lumenOutput).toBe(1700);
  });

  test("een decimaal wattage blijft een decimaal", () => {
    expect(parseProductName("Spot 17.9W 3000K").maxWattage).toBe(17.9);
  });
});

describe("'NO dimmable' is een ontkenning (Buzzi & Buzzi, 744 rijen)", () => {
  test("NO dimmable levert geen dimwaarde", () => {
    expect(parseProductName("Spot NO dimmable 3000K").dimmable).toBeUndefined();
  });

  test("NON DIM blijft werken", () => {
    expect(parseProductName("Spot NON DIM 3000K").dimmable).toBeUndefined();
  });

  test("een gewone dimbare blijft dimbaar", () => {
    expect(parseProductName("Spot dimmable DALI").dimmable).toBe("DALI");
  });
});

// De graden van een koppelstuk, bocht of hoekprofiel zijn de MEETKUNDIGE hoek van dat stuk en
// hebben met licht niets te maken. Gemeten in de nachtrun van 12 aug 2026 over zeven merken,
// samen ±260 rijen: Trizo21 188 (`120°/90° connector`), Lumiparts 32 (`L-joint 90°`, `Bocht 90°`),
// prolicht 25 (`90° corner connector`), Moooi 8 (`bend 90°/135°`), nuudo 6 (`L-joint 90° for
// Track Arcano`), Oligo 1 (`V-KUPPLUNG/TYP A/LT/HORIZONTAL/60°`) en Molto Luce (`VERBINDER 90°`).
// Elk van die runs draaide de waarde met de hand terug — dezelfde familie als `Ta 50°` en `360°`.
// Railassortimenten verkopen per definitie hoekstukken, dus dit komt terug bij elk railmerk.
describe("meetkundige hoeken van koppelstukken zijn geen bundelhoek (7 merken, ±260 rijen)", () => {
  test("L-joint 90° (Lumiparts 32, nuudo 6)", () => {
    expect(soorten("L-joint 90° for Track Arcano black")).toContain("beamAngle:geometriehoek");
  });

  test("corner connector (prolicht 25, Trizo21 188)", () => {
    expect(soorten("NEVER ENDING exterior angle 90° corner connector")).toContain(
      "beamAngle:geometriehoek",
    );
  });

  test("bend (Moooi 8)", () => {
    expect(soorten("Heracleum Endless, bend 135° copper")).toContain("beamAngle:geometriehoek");
  });

  test("Duitse en Nederlandse vormen: VERBINDER, KUPPLUNG, bocht (Molto Luce, Oligo, Lumiparts)", () => {
    expect(soorten("VERBINDER 90° 3-PH SCHIENE")).toContain("beamAngle:geometriehoek");
    expect(soorten("CI V-KUPPLUNG/TYP A/LT/HORIZONTAL/60°")).toContain("beamAngle:geometriehoek");
    expect(soorten("Bocht 90° voor Ocla profiel wit")).toContain("beamAngle:geometriehoek");
  });

  test("een gewone bundelhoek wordt niet gevlagd", () => {
    expect(soorten("Laser Blade 36° 3000K")).not.toContain("beamAngle:geometriehoek");
    expect(soorten("Palco 24° spotlight 3000K")).not.toContain("beamAngle:geometriehoek");
  });

  test("de vlag is ONDERDRUKKEND: parse-namen.ts geeft de hoek niet af", async () => {
    const map = process.env.TMPDIR ?? "/tmp";
    const invoer = `${map}/prijslijst-geometriehoek-${process.pid}.ndjson`;
    await Bun.write(
      invoer,
      [
        JSON.stringify({ nr: "A1", naam: "L-joint 90° for Track Arcano black" }),
        JSON.stringify({ nr: "A2", naam: "Laser Blade 36° 3000K" }),
      ].join("\n"),
    );
    const proc = Bun.spawnSync([
      "bun",
      "run",
      `${import.meta.dir}/parse-namen.ts`,
      invoer,
    ]);
    const rijen = new TextDecoder()
      .decode(proc.stdout)
      .trim()
      .split("\n")
      .map((r) => JSON.parse(r));
    await unlink(invoer);
    expect(rijen[0].parsed.beamAngle).toBeUndefined();
    expect(rijen[0].verdenkingen).toContain("beamAngle:geometriehoek");
    expect(rijen[1].parsed.beamAngle).toBe(36);
  });
});
