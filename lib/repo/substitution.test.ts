// Substitutievoorstel + systeemalternatieven op een echte (PGlite) db.
//   • F-06/07: het voorstel is een veld-voor-veld-vergelijking met bronvermelding.
//   • F-08: het prijsverschil komt ALS TEKST in de saving_note, nooit als sortering.
//   • Regel 2: geld beïnvloedt geen ordening — de veldvolgorde is vast, niet prijs-afhankelijk.
import { expect, test } from "vitest";
import { createTestDb, seedBrandProduct } from "@/db/test-db";
import { addSpecLines, createDossier } from "@/lib/repo/dossiers";
import {
  createSubstitution,
  getSubstitution,
  listSubstitutions,
  systeemAlternatieven,
} from "@/lib/repo/substitution";

const CAT = "Binnenverlichting >> Spot";

async function seed() {
  const db = await createTestDb();
  // Referentie: het voorgeschreven armatuur.
  const { productId: ref } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 CEIL",
    categoryPath: CAT,
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    warrantyMonths: 36,
    repairability: "C",
    epdLifetimeHours: 35000,
    price: "310.00",
  });
  // Alternatief: gelijkwaardig én groener (langere garantie/levensduur), én goedkoper.
  const { productId: alt } = await seedBrandProduct(db, {
    brand: "Kreon",
    name: "ESPRIT CEIL",
    categoryPath: CAT,
    kelvin: 3000,
    cri: 90,
    ip: "IP20",
    warrantyMonths: 120,
    repairability: "A",
    epdLifetimeHours: 100000,
    price: "260.00",
  });
  return { db, ref, alt };
}

test("createSubstitution: veld-voor-veld met bron 'brand-provided' + prijsverschil als tekst", async () => {
  const { db, ref, alt } = await seed();
  const dossier = await createDossier(db, { name: "Ziekenhuis Noord", xisPhase: "deal_making" });

  const row = await createSubstitution(db, {
    dossierId: dossier.id,
    referenceProductId: ref,
    alternativeProductId: alt,
    actor: "t@brink",
  });

  const fields = row.fields ?? [];
  expect(fields.length).toBeGreaterThan(0);
  // Elk veld draagt een bron, en die bron is de brand-provided (we citeren het merk zelf).
  expect(fields.every((f) => f.source === "brand-provided")).toBe(true);

  // De veldvolgorde is vast (technisch → duurzaamheid), niet prijs-afhankelijk (regel 2).
  expect(fields[0].field).toBe("Color temperature");

  const byLabel = Object.fromEntries(fields.map((f) => [f.field, f]));
  // Technische velden veld-voor-veld aanwezig.
  expect(byLabel["Color temperature"].reference).toBe("3000K");
  expect(byLabel["Color temperature"].alternative).toBe("3000K");
  expect(byLabel["CRI"]).toBeTruthy();
  expect(byLabel["IP value"].reference).toBe("IP20");
  // Duurzaamheidsvelden (garantie / repareerbaarheid / EPD) veld-voor-veld aanwezig.
  expect(byLabel["Warranty"].reference).toBe("36 mo");
  expect(byLabel["Warranty"].alternative).toBe("120 mo");
  expect(byLabel["Repairability"].reference).toBe("C");
  expect(byLabel["Repairability"].alternative).toBe("A");
  expect(byLabel["Levensduur (EPD)"].reference).toBe("35000 u");
  expect(byLabel["Levensduur (EPD)"].alternative).toBe("100000 u");

  // F-08: het prijsverschil (310 - 260 = 50) staat ALS TEKST in de saving_note.
  expect(row.savingNote).toBeTruthy();
  expect(row.savingNote!).toContain("Saving");
  expect(row.savingNote!).toContain("50,00");
  // en de note zegt expliciet dat prijs niet meeweegt in de rangschikking.
  expect(row.savingNote!.toLowerCase()).toContain("weegt");
});

test("createSubstitution: duurdere alternatief → 'Additional cost' als tekst (nog steeds geen sortering)", async () => {
  const { db, ref } = await seed();
  const dossier = await createDossier(db, { name: "Kantoor Zuid", xisPhase: "deal_making" });
  // Een duurder, gelijkwaardig alternatief.
  const { productId: duur } = await seedBrandProduct(db, {
    brand: "Occhio",
    name: "MITO CEIL",
    categoryPath: CAT,
    kelvin: 3000,
    price: "480.00",
  });
  const row = await createSubstitution(db, {
    dossierId: dossier.id,
    referenceProductId: ref,
    alternativeProductId: duur,
  });
  expect(row.savingNote!).toContain("Additional cost");
  expect(row.savingNote!).toContain("170,00"); // 480 - 310
});

test("getSubstitution + listSubstitutions: identiteit uit de catalogus + samenvatting", async () => {
  const { db, ref, alt } = await seed();
  const dossier = await createDossier(db, { name: "School West", xisPhase: "deal_making" });
  const row = await createSubstitution(db, {
    dossierId: dossier.id,
    referenceProductId: ref,
    alternativeProductId: alt,
  });

  const detail = await getSubstitution(db, row.id);
  expect(detail).not.toBeNull();
  expect(detail!.dossierId).toBe(dossier.id);
  expect(detail!.reference.name).toBe("SASSO 100 CEIL");
  expect(detail!.reference.brandName).toBe("XAL");
  expect(detail!.alternative.name).toBe("ESPRIT CEIL");
  expect(detail!.alternative.brandName).toBe("Kreon");
  expect(detail!.fields).toHaveLength(7);

  const list = await listSubstitutions(db, dossier.id);
  expect(list).toHaveLength(1);
  expect(list[0].alternativeBrand).toBe("Kreon");
  expect(list[0].referenceName).toBe("SASSO 100 CEIL");
});

test("createSubstitution: onzichtbaar (verlopen) product geeft geen voorstel", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: "Verlopen", xisPhase: "deal_making" });
  const { productId: ref } = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 CEIL",
    categoryPath: CAT,
    price: "310.00",
  });
  const { productId: ghost } = await seedBrandProduct(db, {
    brand: "Ghost",
    name: "PHANTOM CEIL",
    categoryPath: CAT,
    price: "100.00",
    validUntil: "2020-01-01", // verlopen → onvindbaar (regel 3)
  });
  await expect(
    createSubstitution(db, {
      dossierId: dossier.id,
      referenceProductId: ref,
      alternativeProductId: ghost,
    }),
  ).rejects.toThrow();
});

test("systeemAlternatieven: N spots in een zone → voorstel voor één lijnsysteem", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: "Kliniek", xisPhase: "deal_making" });
  await addSpecLines(db, dossier.id, [
    { fixtureCode: "Lp01", quantity: 4, zone: "Gang", productText: "Inbouwspot" },
    { fixtureCode: "Lp02", quantity: 3, zone: "Gang", productText: "LED spot" },
    { fixtureCode: "Lw01", quantity: 2, zone: "Gang", productText: "Wandarmatuur" }, // geen spot
    { fixtureCode: "Ld01", quantity: 1, zone: "Kantoor", productText: "Downlight spot" }, // < drempel
  ]);

  const alts = await systeemAlternatieven(db, dossier.id);
  const gang = alts.find((a) => a.zone === "Gang");
  expect(gang).toBeTruthy();
  expect(gang!.spotCount).toBe(7); // 4 + 3; de wandarmatuur telt niet mee
  expect(gang!.lineCount).toBe(2);
  expect(gang!.kind).toBe("voorstel");
  // Zone "Kantoor" heeft maar 1 spot → onder de drempel, geen voorstel.
  expect(alts.some((a) => a.zone === "Kantoor")).toBe(false);
});
