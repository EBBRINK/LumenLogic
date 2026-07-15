// EENMALIGE render-smoke (bouwstap 1, go/no-go) tegen het echte Deerns-armaturenboek:
// 31 pagina's 600dpi-JPEG zonder tekstlaag. Bewijst in échte chromium: unpdf's pdfjs
// rendert met `page.render({ canvas, viewport })`, 1568px langste zijde, JPEG ~0.8,
// en meet per pagina afmetingen/bytes/rendertijd. Slaat 3 pagina's als PNG naast dit
// bestand op (gitignored via **/*.test.png) voor een menselijke leesbaarheidscheck.
//
// Het boek zelf staat NIET in git: leg het in data/smoke/ (gitignored). Ontbreekt het
// bestand, dan skipt de test — zo draait CI alleen de kleine fixture in render.test.ts.
import { commands } from "vitest/browser";
import { expect, test } from "vitest";
import { openPdfDocument, renderPdfPageToJpeg } from "./render";

const BOOK_PATH = "data/smoke/07364_NLD_BD_LIG_armaturenboek_ANN_20260313.pdf";
// PNG's om zelf te bekijken (pagina 4 = inhoudsopgave met armatuurcodes als Lp001-a).
const SAVE_PAGES = [1, 4, 20];

test("smoke: rendert het echte Deerns-boek pagina voor pagina op 1568px", async (ctx) => {
  let base64: string;
  try {
    base64 = await commands.readFile(BOOK_PATH, "base64");
  } catch {
    ctx.skip();
    return;
  }
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  expect(bytes.length).toBeGreaterThan(5_000_000);

  const pdf = await openPdfDocument(bytes);
  expect(pdf.numPages).toBe(31);

  const canvas = document.createElement("canvas");
  const rows: string[] = [];
  let totalMs = 0;
  let totalBytes = 0;

  for (let n = 1; n <= pdf.numPages; n++) {
    const t0 = performance.now();
    const page = await renderPdfPageToJpeg(pdf, n, { canvas });
    const ms = Math.round(performance.now() - t0);
    totalMs += ms;
    totalBytes += page.blob.size;

    expect(Math.max(page.width, page.height)).toBe(1568);
    expect(page.blob.type).toBe("image/jpeg");
    expect(page.blob.size).toBeGreaterThan(10_000);
    // Ruim onder de 4MB-FormData-limiet per pagina (B2) — met marge.
    expect(page.blob.size).toBeLessThan(1_500_000);

    rows.push(
      `pagina ${String(n).padStart(2)}: ${page.width}x${page.height}px  ` +
        `${Math.round(page.blob.size / 1024)} KB  ${ms} ms`,
    );

    if (SAVE_PAGES.includes(n)) {
      // De ge-encodeerde JPEG (~0.8) terug op een canvas tekenen en als PNG bewaren:
      // zo beoordeel je precies wat de vision-API straks te zien krijgt (inclusief
      // JPEG-artefacten), in een container die overal opent. Gitignored (*.test.png).
      const bitmap = await createImageBitmap(page.blob);
      const view = document.createElement("canvas");
      view.width = bitmap.width;
      view.height = bitmap.height;
      view.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = view.toDataURL("image/png").split(",")[1];
      await commands.writeFile(
        `lib/pdf/render-smoke.page${n}.test.png`,
        png,
        "base64",
      );
    }
  }

  // Meetrapport in de testuitvoer — het go/no-go-bewijs van bouwstap 1.
  console.info(
    [
      "— render-smoke Deerns-boek —",
      ...rows,
      `totaal: ${Math.round(totalBytes / 1024)} KB JPEG, ${totalMs} ms render`,
    ].join("\n"),
  );
}, 120_000);
