// Tegelplan voor de OCR-rasterisatie (goal-import-ai-leesroute stap 5, O4).
//
// Probleem: een A3-armaturenboekpagina op één beeld van max 1568 px lange zijde
// is effectief ~95 dpi — te weinig pixels per letter, het model verzint merken
// (Dordrecht-nulmeting: 8/18 verzonnen). Oplossing: pagina's onder een
// dpi-drempel in overlappende tegels van elk ≤1568 px renderen (~300 dpi
// effectief) en per tegel naar de vision-call sturen; de bestaande
// rijkste-wint-dedup op armatuurcode voegt de lezingen samen.
//
// Dit bestand is bewust PUUR met NUL imports: het draait in de browser (de
// upload-kaart), in het meetscript (Bun) en in de repo-laag — één tegelplan,
// overal byte-identiek.
//
// INVARIANT: tile 0 ⟺ het beeld beslaat de HELE pagina. Elke pagina boven de
// dpi-drempel krijgt precies één element met tile 0 (het bestaande
// hele-pagina-pad); getegelde pagina's nummeren 1..N (rij-major, linksboven
// eerst) en hebben nooit een tegel 0. Bestaande ocr_page_images-rijen zijn per
// definitie hele pagina's → migratie 0011 backfillt ze via DEFAULT 0.

// Anthropic-vision-limiet: beelden > 1568 px op de langste zijde worden door de
// API teruggeschaald — dat kost juist de pixels van de armatuurcodes. Dus zelf
// exact op 1568 px begrenzen. Historisch OCR_MAX_SIDE_PX in lib/pdf/render.ts;
// verhuisd hierheen (render.ts re-exporteert, bestaande importeurs zoals
// scripts/eval/raster.ts blijven werken).
export const OCR_MAX_SIDE_PX = 1568;
export const OCR_JPEG_QUALITY = 0.8;

// Tegelmaat = dezelfde API-limiet: elke tegel is zelf een vision-beeld.
export const TILE_MAX_SIDE_PX = 1568;
// Doelresolutie voor getegelde pagina's: 300 dpi — genoeg voor 6pt-lettertjes
// in een dichte A3-tabel.
export const TILE_TARGET_DPI = 300;
// Minimale overlap tussen buurtegels: een tabelrij die op de rand van tegel A
// wordt afgesneden staat gegarandeerd compleet in buurtegel B (de prompt zegt
// het model afgesneden rijen over te slaan). 128 px ≈ 31 pt ≈ 2–3 tekstregels.
export const TILE_MIN_OVERLAP_PX = 128;
// Drempel: haalt het bestaande hele-pagina-pad (langste zijde op 1568 px) nog
// ≥120 dpi effectief, dan tegelen we NIET — A4 (842 pt → ~134 dpi) blijft dus
// het oude, bewezen pad; A3 (1190 pt → ~95 dpi) gaat in tegels.
export const TILE_DPI_THRESHOLD = 120;

export type PageTile = {
  /** 0 = hele pagina (invariant hierboven); 1..N = rij-major tegelnummer. */
  tile: number;
  /** Uitsnede in PDF-punten (pt), in paginacoördinaten. */
  sourceRect: { xPt: number; yPt: number; widthPt: number; heightPt: number };
  /** pdfjs-viewport-scale waarmee deze uitsnede gerenderd moet worden. */
  renderScale: number;
  /** Canvasmaat in hele pixels (afgerond zoals lib/pdf/render.ts dat doet). */
  outPx: { width: number; height: number };
};

// Eén as opdelen in segmenten van exact TILE_MAX_SIDE_PX, gelijkmatig verdeeld
// met minimaal TILE_MIN_OVERLAP_PX overlap. n = ceil((dimPx − overlap) /
// (tegel − overlap)): het kleinste aantal tegels waarbij de stride
// (dimPx − 1568)/(n−1) hooguit 1568−128 px is, dus de overlap ≥128 px blijft.
// dimPx ≤ 1568 → één segment over de hele as (geen tegel groter dan de pagina).
// Het laatste segment eindigt exact op de paginarand (geen out-of-bounds).
function axisSegments(dimPx: number): { offsetPx: number; sizePx: number }[] {
  if (dimPx <= TILE_MAX_SIDE_PX) return [{ offsetPx: 0, sizePx: dimPx }];
  const n = Math.ceil(
    (dimPx - TILE_MIN_OVERLAP_PX) / (TILE_MAX_SIDE_PX - TILE_MIN_OVERLAP_PX),
  );
  const stride = (dimPx - TILE_MAX_SIDE_PX) / (n - 1);
  const segments: { offsetPx: number; sizePx: number }[] = [];
  for (let i = 0; i < n; i++) {
    segments.push({
      // Randtegel exact op de rand — niet i*stride, dat kan door drijvende-
      // komma-optelling een fractie voorbij de paginarand uitkomen.
      offsetPx: i === n - 1 ? dimPx - TILE_MAX_SIDE_PX : i * stride,
      sizePx: TILE_MAX_SIDE_PX,
    });
  }
  return segments;
}

// Het tegelplan voor één pagina (afmetingen in PDF-punten, zoals
// page.getViewport({scale: 1}) ze geeft).
//
// Boven de drempel: exact één element met tile 0 — byte-identiek aan het
// huidige hele-pagina-pad in lib/pdf/render.ts (renderScale = 1568/max(w,h),
// outPx = Math.round(pt × scale), zoals canvas.width = Math.round(
// viewport.width) daar).
//
// Onder de drempel: renderScale = 300/72; per as n = ceil((dimPx − 128)/1440)
// tegels van exact 1568 px, rij-major genummerd 1..N.
//
// Rekensom A3 landscape (1190 × 842 pt, het Dordrecht-boek):
//   effectieveDpi = 1568/1190 × 72 ≈ 94,9 < 120 → tegelen op 300/72 ≈ 4,1667
//   breedte  1190 pt → 4958,3 px → nX = ceil(4830,3/1440) = 4
//   hoogte    842 pt → 3508,3 px → nY = ceil(3380,3/1440) = 3   → 4×3 = 12
//   strideX = (4958,3−1568)/3 ≈ 1130,1 px → overlap ≈ 1568−1130,1 ≈ 438 px
//   strideY = (3508,3−1568)/2 ≈  970,2 px → overlap ≈ 1568−970,2 ≈ 598 px
export function planPageTiles(widthPt: number, heightPt: number): PageTile[] {
  const maxSidePt = Math.max(widthPt, heightPt);
  const effectiveDpi = (TILE_MAX_SIDE_PX / maxSidePt) * 72;

  if (effectiveDpi >= TILE_DPI_THRESHOLD) {
    // Hele-pagina-pad: tile 0, exact zoals renderPdfPageToJpeg vandaag rendert.
    const renderScale = TILE_MAX_SIDE_PX / maxSidePt;
    return [
      {
        tile: 0,
        sourceRect: { xPt: 0, yPt: 0, widthPt, heightPt },
        renderScale,
        outPx: {
          width: Math.round(widthPt * renderScale),
          height: Math.round(heightPt * renderScale),
        },
      },
    ];
  }

  const renderScale = TILE_TARGET_DPI / 72;
  const widthPx = widthPt * renderScale;
  const heightPx = heightPt * renderScale;
  const cols = axisSegments(widthPx);
  const rows = axisSegments(heightPx);

  const tiles: PageTile[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const row = rows[r];
      const tileWidthPt = col.sizePx / renderScale;
      const tileHeightPt = row.sizePx / renderScale;
      // Terug naar pt, geklemd binnen de pagina: px→pt-deling kan een
      // drijvende-komma-fractie voorbij de rand opleveren.
      const xPt = Math.max(
        0,
        Math.min(col.offsetPx / renderScale, widthPt - tileWidthPt),
      );
      const yPt = Math.max(
        0,
        Math.min(row.offsetPx / renderScale, heightPt - tileHeightPt),
      );
      tiles.push({
        // Rij-major 1..N: linksboven eerst, dan naar rechts, dan de volgende rij.
        tile: r * cols.length + c + 1,
        sourceRect: {
          xPt,
          yPt,
          widthPt: tileWidthPt,
          heightPt: tileHeightPt,
        },
        renderScale,
        outPx: {
          width: Math.round(col.sizePx),
          height: Math.round(row.sizePx),
        },
      });
    }
  }
  return tiles;
}
