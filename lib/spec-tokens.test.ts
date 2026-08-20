// De herkenner van specwaarden in de vrije zoektekst. Pure functie, dus geen database.
//
// Twee soorten fout die deze tests moeten vangen, en ze wijzen tegengesteld:
//   • TE WEINIG herkennen — "Entero 2700" blijft een naamzoekopdracht die nul oplevert.
//     Dat was precies de aanleiding (docs/goal-live-teller.md).
//   • TE VEEL herkennen — een artikelnummer, een lumenwaarde of een serienaam wordt als
//     kleurtemperatuur gelezen en de gebruiker mist producten zonder te snappen waarom.
// De grenzen hieronder zijn dus geen willekeur; elke test die er één afdwingt, hoort erbij
// te zeggen wat er anders stukgaat.
import { expect, test } from "vitest";
import { leesSpecTokens } from "@/lib/spec-tokens";

test("het klantvoorbeeld: 2700 wordt kleurtemperatuur, Entero blijft tekst", () => {
  const r = leesSpecTokens("Entero 2700");
  expect(r.restTekst).toBe("Entero");
  expect(r.herkend).toEqual([
    { token: "2700", veld: "kelvin", waarde: 2700, toegepast: true },
  ]);
});

test("2700K met eenheid erachter telt net zo goed", () => {
  const r = leesSpecTokens("Entero 2700K");
  expect(r.restTekst).toBe("Entero");
  expect(r.herkend[0]).toMatchObject({ veld: "kelvin", waarde: 2700 });
});

test("IP en CRI, aaneengeschreven en met spatie", () => {
  const glued = leesSpecTokens("Sasso IP44 CRI90");
  expect(glued.restTekst).toBe("Sasso");
  expect(glued.herkend.map((h) => [h.veld, h.waarde])).toEqual([
    ["ip", 44],
    ["cri", 90],
  ]);

  // Met spatie kost het twee tokens. Zonder vooruitkijken zou "IP" als tekstwoord
  // achterblijven en de strenge AND-match onmogelijk maken — geen enkele productnaam
  // bevat het losse woord "IP".
  const spaced = leesSpecTokens("Sasso IP 44 CRI 90");
  expect(spaced.restTekst).toBe("Sasso");
  expect(spaced.herkend.map((h) => [h.veld, h.waarde])).toEqual([
    ["ip", 44],
    ["cri", 90],
  ]);
});

test("Ra is hetzelfde veld als CRI", () => {
  const r = leesSpecTokens("Sasso Ra90");
  expect(r.herkend[0]).toMatchObject({ veld: "cri", waarde: 90 });
});

// ── De grenzen: wat NIET als spec gelezen mag worden ────────────────────────────

test("een lumenwaarde blijft tekst — 1200 is geen kleurtemperatuur", () => {
  // 1200 lm komt in productnamen voor; als kelvin zou het producten wegfilteren die de
  // gebruiker juist zocht. De ondergrens van 1800 houdt dat buiten de deur.
  const r = leesSpecTokens("Entero 1200");
  expect(r.restTekst).toBe("Entero 1200");
  expect(r.herkend).toEqual([]);
});

test("een artikelnummer blijft tekst", () => {
  // Zowel de vorm met letters als een lang kaal nummer: geen van beide is een specwaarde.
  expect(leesSpecTokens("L360048").restTekst).toBe("L360048");
  expect(leesSpecTokens("360048").restTekst).toBe("360048");
  expect(leesSpecTokens("L360048").herkend).toEqual([]);
});

test("een getal boven de daglichtgrens blijft tekst", () => {
  const r = leesSpecTokens("Sasso 8000");
  expect(r.restTekst).toBe("Sasso 8000");
  expect(r.herkend).toEqual([]);
});

test("SASSO 100 blijft ongemoeid — 100 valt buiten elke plausibele grens", () => {
  const r = leesSpecTokens("SASSO 100");
  expect(r.restTekst).toBe("SASSO 100");
  expect(r.herkend).toEqual([]);
});

test("een onmogelijke IP-code blijft tekst", () => {
  // IP-codes zijn twee cijfers. "IP440" is er geen, en het als 44 lezen zou raden zijn.
  const r = leesSpecTokens("Sasso IP440");
  expect(r.restTekst).toBe("Sasso IP440");
  expect(r.herkend).toEqual([]);
});

test("twee kleurtemperaturen: alleen de eerste wordt gelezen", () => {
  // Wie "2700 4000" typt bedoelt geen twee kleurtemperaturen. De tweede blijft tekst en
  // valt daarmee vanzelf op in de uitslag, in plaats van stil de eerste te overschrijven.
  const r = leesSpecTokens("Entero 2700 4000");
  expect(r.restTekst).toBe("Entero 4000");
  expect(r.herkend).toHaveLength(1);
  expect(r.herkend[0].waarde).toBe(2700);
});

test("een zoektekst zonder specwaarden komt er onveranderd uit", () => {
  const r = leesSpecTokens("MOUNTING KIT ENTERO RD-S");
  expect(r.restTekst).toBe("MOUNTING KIT ENTERO RD-S");
  expect(r.herkend).toEqual([]);
});

test("lege tekst is geen probleem", () => {
  expect(leesSpecTokens("")).toEqual({ restTekst: "", herkend: [] });
  expect(leesSpecTokens("   ")).toEqual({ restTekst: "", herkend: [] });
});
