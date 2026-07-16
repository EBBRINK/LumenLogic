// Tegelplan (stap 5, O4) — puur, geen DB, geen pdfjs: de wiskunde van
// planPageTiles vastgepind. Belangrijkste ankers: A3 → 12 tegels op 300 dpi,
// A4 → exact het bestaande hele-pagina-pad (tile 0, byte-identieke afronding),
// en de overlap-/dekking-invarianten waarop de prompt ("afgesneden rijen staan
// compleet in een buurtegel") leunt.
import { expect, test } from "vitest";
import {
  OCR_MAX_SIDE_PX,
  planPageTiles,
  TILE_DPI_THRESHOLD,
  TILE_MAX_SIDE_PX,
  TILE_MIN_OVERLAP_PX,
  TILE_TARGET_DPI,
  type PageTile,
} from "@/lib/pdf/tiles";

// Unieke as-offsets (pt), gesorteerd — voor het aflezen van het kolommen/rijen-raster.
function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((v) => Number(v.toFixed(6))))].sort(
    (a, b) => a - b,
  );
}

// Dekking + overlap op één as: segmenten [start, start+size) in pt.
// Eist: begint op 0, eindigt op de paginarand, en elk paar buursegmenten
// overlapt ≥ TILE_MIN_OVERLAP_PX (in px, dus × renderScale) — daarmee valt elk
// punt van de as in minstens één segment.
function assertAxisCoverage(
  segments: { start: number; size: number }[],
  dimPt: number,
  renderScale: number,
) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  expect(sorted[0].start).toBeCloseTo(0, 4);
  expect(sorted[sorted.length - 1].start + sorted[sorted.length - 1].size).toBeCloseTo(
    dimPt,
    4,
  );
  for (let i = 1; i < sorted.length; i++) {
    const overlapPt = sorted[i - 1].start + sorted[i - 1].size - sorted[i].start;
    const overlapPx = overlapPt * renderScale;
    expect(overlapPx).toBeGreaterThanOrEqual(TILE_MIN_OVERLAP_PX - 1e-6);
  }
}

function axesOf(tiles: PageTile[]) {
  const xs = uniqueSorted(tiles.map((t) => t.sourceRect.xPt));
  const ys = uniqueSorted(tiles.map((t) => t.sourceRect.yPt));
  return { xs, ys };
}

// ── A3 landscape: het Dordrecht-geval ────────────────────────────────────────
test("A3 landscape 1190×842 → 12 tegels (4×3), 300 dpi, alle zijden ≤1568, nummering 1..12", () => {
  const tiles = planPageTiles(1190, 842);
  expect(tiles).toHaveLength(12);
  const { xs, ys } = axesOf(tiles);
  expect(xs).toHaveLength(4); // 4 kolommen
  expect(ys).toHaveLength(3); // 3 rijen

  for (const t of tiles) {
    expect(t.renderScale).toBe(TILE_TARGET_DPI / 72);
    expect(t.outPx.width).toBeLessThanOrEqual(TILE_MAX_SIDE_PX);
    expect(t.outPx.height).toBeLessThanOrEqual(TILE_MAX_SIDE_PX);
    // Getegelde pagina: elke tegel is exact de tegelmaat (beide assen >1568 px).
    expect(t.outPx).toEqual({ width: TILE_MAX_SIDE_PX, height: TILE_MAX_SIDE_PX });
    // Binnen de pagina (geen out-of-bounds).
    expect(t.sourceRect.xPt).toBeGreaterThanOrEqual(0);
    expect(t.sourceRect.yPt).toBeGreaterThanOrEqual(0);
    expect(t.sourceRect.xPt + t.sourceRect.widthPt).toBeLessThanOrEqual(1190 + 1e-6);
    expect(t.sourceRect.yPt + t.sourceRect.heightPt).toBeLessThanOrEqual(842 + 1e-6);
  }

  // Nummering 1..12, rij-major (linksboven eerst): tegel 1 op (0,0), tegel 4 is
  // de laatste van rij 1, tegel 5 begint rij 2 weer links.
  expect(tiles.map((t) => t.tile)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(tiles[0].sourceRect.xPt).toBeCloseTo(0, 6);
  expect(tiles[0].sourceRect.yPt).toBeCloseTo(0, 6);
  expect(tiles[3].sourceRect.yPt).toBeCloseTo(tiles[0].sourceRect.yPt, 5);
  expect(tiles[3].sourceRect.xPt).toBeCloseTo(xs[3], 5);
  expect(tiles[4].sourceRect.xPt).toBeCloseTo(0, 6);
  expect(tiles[4].sourceRect.yPt).toBeCloseTo(ys[1], 5);

  // Feitelijke overlap (zie rekensom in tiles.ts): ~438 px op x, ~598 px op y.
  const scale = TILE_TARGET_DPI / 72;
  const overlapX = (xs[0] + tiles[0].sourceRect.widthPt - xs[1]) * scale;
  const overlapY = (ys[0] + tiles[0].sourceRect.heightPt - ys[1]) * scale;
  expect(overlapX).toBeCloseTo(437.9, 0);
  expect(overlapY).toBeCloseTo(597.8, 0);
});

test("A3 portrait 842×1190 → 12 tegels (3×4)", () => {
  const tiles = planPageTiles(842, 1190);
  expect(tiles).toHaveLength(12);
  const { xs, ys } = axesOf(tiles);
  expect(xs).toHaveLength(3); // 3 kolommen
  expect(ys).toHaveLength(4); // 4 rijen
  expect(tiles.map((t) => t.tile)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

// ── A4: het bestaande hele-pagina-pad, byte-identiek (regressie-anker) ───────
test("A4 595×842 → exact één tile 0 met de outPx-afronding van render.ts", () => {
  const tiles = planPageTiles(595, 842);
  // Zelfde rekenweg als renderPdfPageToJpeg (lib/pdf/render.ts): scale =
  // 1568/max(w,h); canvas.width/height = Math.round(pt × scale).
  const scale = OCR_MAX_SIDE_PX / 842;
  expect(tiles).toEqual([
    {
      tile: 0,
      sourceRect: { xPt: 0, yPt: 0, widthPt: 595, heightPt: 842 },
      renderScale: scale,
      outPx: {
        width: Math.round(595 * scale), // 1108
        height: Math.round(842 * scale), // 1568
      },
    },
  ]);
  expect(tiles[0].outPx).toEqual({ width: 1108, height: 1568 });
});

// ── Overlap-/dekking-invarianten ─────────────────────────────────────────────
test("elk punt van de pagina valt in ≥1 tegel; buurtegels overlappen ≥128 px op beide assen", () => {
  for (const [w, h] of [
    [1190, 842], // A3 landscape
    [842, 1190], // A3 portrait
    [1200, 200], // extreem langwerpig: y-as blijft één segment (≤1568 px)
    [941, 941], // nét onder de dpi-drempel, vierkant
  ] as const) {
    const tiles = planPageTiles(w, h);
    expect(tiles.length).toBeGreaterThan(1);
    const scale = tiles[0].renderScale;
    const { xs, ys } = axesOf(tiles);
    assertAxisCoverage(
      xs.map((x) => ({
        start: x,
        size: tiles.find((t) => Math.abs(t.sourceRect.xPt - x) < 1e-6)!
          .sourceRect.widthPt,
      })),
      w,
      scale,
    );
    assertAxisCoverage(
      ys.map((y) => ({
        start: y,
        size: tiles.find((t) => Math.abs(t.sourceRect.yPt - y) < 1e-6)!
          .sourceRect.heightPt,
      })),
      h,
      scale,
    );
    // Raster compleet: elke (kolom, rij)-combinatie is precies één tegel.
    expect(tiles).toHaveLength(xs.length * ys.length);
  }
});

test("smalle as (≤1568 px) van een getegelde pagina: één segment over de hele as", () => {
  // 1200×200 pt: x-as tegelt (5000 px), y-as is 833 px → één segment, volle hoogte.
  const tiles = planPageTiles(1200, 200);
  const { ys } = axesOf(tiles);
  expect(ys).toEqual([0]);
  for (const t of tiles) {
    expect(t.sourceRect.heightPt).toBeCloseTo(200, 6);
    expect(t.outPx.height).toBe(Math.round(200 * (TILE_TARGET_DPI / 72))); // 833
    expect(t.outPx.height).toBeLessThanOrEqual(TILE_MAX_SIDE_PX);
  }
});

// ── De dpi-drempel, op de rand ───────────────────────────────────────────────
test("drempelranden: nét ≥120 dpi → één tile 0; nét <120 dpi → tegelen", () => {
  // Grens: langste zijde = 1568×72/120 = 940,8 pt (precies 120 dpi).
  const boundary = (TILE_MAX_SIDE_PX * 72) / TILE_DPI_THRESHOLD;
  expect(boundary).toBeCloseTo(940.8, 6);

  // Nét erboven qua dpi (kleinere pagina): één hele-pagina-tegel.
  const single = planPageTiles(940, 600);
  expect(single).toHaveLength(1);
  expect(single[0].tile).toBe(0);
  expect(single[0].renderScale).toBeCloseTo(TILE_MAX_SIDE_PX / 940, 9);

  // Exact op de grens (≥ is inclusief): nog steeds het hele-pagina-pad.
  const exact = planPageTiles(boundary, 600);
  expect(exact).toHaveLength(1);
  expect(exact[0].tile).toBe(0);

  // Nét eronder: tegelen op 300 dpi.
  const tiled = planPageTiles(941, 600);
  expect(tiled.length).toBeGreaterThan(1);
  for (const t of tiled) {
    expect(t.tile).toBeGreaterThanOrEqual(1);
    expect(t.renderScale).toBe(TILE_TARGET_DPI / 72);
  }
});

// ── De bestaande test-PDF's (render.test.ts gebruikt 400×300-pagina's) ───────
test("400×300 pt → één tegel (tile 0): pint de drempel voor de bestaande test-PDF's vast", () => {
  const tiles = planPageTiles(400, 300);
  expect(tiles).toHaveLength(1);
  expect(tiles[0].tile).toBe(0);
  expect(tiles[0].sourceRect).toEqual({ xPt: 0, yPt: 0, widthPt: 400, heightPt: 300 });
  // Zelfde afronding als render.ts: 1568 breed, round(300/400 × 1568) = 1176 hoog.
  expect(tiles[0].outPx).toEqual({ width: OCR_MAX_SIDE_PX, height: 1176 });
});
