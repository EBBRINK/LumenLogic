// Import-voorstel: bevestigen maakt alléén spec_lines van de aangevinkte rows (OCR staat
// standaard uit), draait de matcher erop, en zet de run op 'bevestigd'. De niet-aangevinkte
// rij mag géén spec-regel worden — anders wordt er stilzwijgend iets geïmporteerd.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { createDossier, getSpecLines } from "@/lib/repo/dossiers";
import {
  confirmImportRun,
  createImportRun,
  getImportRun,
} from "@/lib/repo/imports";
import type { ImportRow } from "@/db/schema";
import { STATUS } from "@/components/dossier/status";

test("bevestigen maakt alleen de aangevinkte rows tot spec_lines + matcht ze", async () => {
  const db = await createTestDb();
  // een merk in de catalogus zodat de matcher een echte status kan zetten
  await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 3000K",
    price: "310.00",
    kelvin: 3000,
  });
  const dossier = await createDossier(db, { name: "Ziekenhuis Noord" });

  const rows: ImportRow[] = [
    {
      fixtureCode: "Lp301",
      quantity: 12,
      brandText: "XAL",
      productText: "SASSO 100",
      specs: { kelvin: 3000 },
      source: "ocr",
      page: 1,
      checked: true,
    },
    {
      // OCR-onzeker → standaard uitgevinkt; mag GEEN spec-regel worden
      fixtureCode: "Lx999",
      quantity: null,
      brandText: "??",
      productText: "onleesbaar",
      source: "ocr",
      page: 1,
      checked: false,
    },
    {
      fixtureCode: "Lw201",
      quantity: 8,
      brandText: "Wever & Ducré",
      productText: "SCAVA 1.0",
      source: "ocr",
      page: 2,
      checked: true,
    },
  ];

  const run = await createImportRun(db, {
    dossierId: dossier.id,
    source: "ocr",
    filename: "armaturenboek.pdf",
    rows,
    confidence: "middel",
    actor: "test",
  });
  expect(run.status).toBe("voorstel");

  // de mens vinkt alleen rij 0 en rij 2 aan
  const { created } = await confirmImportRun(db, run.id, [0, 2], "test");
  expect(created).toHaveLength(2);

  const lines = await getSpecLines(db, dossier.id);
  const codes = lines.map((l) => l.fixtureCode).sort();
  expect(codes).toEqual(["Lp301", "Lw201"]);
  // de uitgevinkte OCR-rij is nergens beland
  expect(codes).not.toContain("Lx999");

  // elke nieuwe regel heeft een geldige status gekregen (matcher heeft gedraaid) + herkomst
  for (const l of lines) {
    expect(Object.keys(STATUS)).toContain(l.status);
    expect(l.source).toBe("ocr");
  }
  // Lp301 matcht het gezaaide XAL-product → groen; herkomst-confidence overgenomen
  const lp301 = lines.find((l) => l.fixtureCode === "Lp301")!;
  expect(lp301.status).toBe("groen");

  // run staat na bevestigen op 'bevestigd'
  const after = await getImportRun(db, run.id);
  expect(after?.status).toBe("bevestigd");
});

test("annuleren/re-run: een al bevestigde run voegt niets extra toe (idempotent)", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: "Kantoor Zuid" });
  const rows: ImportRow[] = [
    { fixtureCode: "A1", quantity: 1, brandText: "X", productText: "y", source: "csv", checked: true },
  ];
  const run = await createImportRun(db, {
    dossierId: dossier.id,
    source: "csv",
    rows,
  });
  await confirmImportRun(db, run.id, [0]);
  // tweede keer bevestigen mag geen dubbele regel maken
  const second = await confirmImportRun(db, run.id, [0]);
  expect(second.created).toHaveLength(0);
  const lines = await getSpecLines(db, dossier.id);
  expect(lines).toHaveLength(1);
});
