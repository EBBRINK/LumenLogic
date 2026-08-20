// DOCX-naad, pure kant: mammoth's HTML → rijen. De mammoth-parse zelf is buiten
// vitest geverifieerd onder Bun (20 aug: tabellen → <table>-HTML, raw text komt
// mee); hier toetsen we de tag-scanner die daar rijen van maakt — dat is de kant
// die kapot kán gaan zonder dat iemand het ziet.
import { expect, test } from "vitest";
import { rowsFromHtmlTables } from "./rows-from-docx";

test("mammoth-vormige HTML: tabellen → rijen, tekst buiten tabellen valt weg", () => {
  const html =
    "<p>Armaturenstaat</p>" +
    "<table><tr><td><p>Code</p></td><td><p>Aantal</p></td></tr>" +
    "<tr><td><p>Lp301</p></td><td><p>12</p></td></tr></table>" +
    "<p>Slotopmerking</p>";
  expect(rowsFromHtmlTables(html)).toEqual([
    ["Code", "Aantal"],
    ["Lp301", "12"],
  ]);
});

test("meerdere tabellen worden één rijenlijst; entiteiten en <br> netjes plat", () => {
  const html =
    "<table><tr><td>Wever &amp; Ducr&#39;e</td></tr></table>" +
    "<table><tr><th>regel<br>twee</th><td>&lt;3&nbsp;W&gt;</td></tr></table>";
  expect(rowsFromHtmlTables(html)).toEqual([
    ["Wever & Ducr'e"],
    ["regel twee", "<3 W>"],
  ]);
});

test("document zonder tabellen → geen rijen (vrije-tekst-fallbackpad)", () => {
  expect(rowsFromHtmlTables("<p>alleen lopende tekst</p>")).toEqual([]);
});
