"use server";

// De live treffer-teller van /catalog (demosessie Brink Licht, 12 aug): tijdens het typen
// telt het aantal treffers mee, zonder enter. Dit is bewust een action die een WAARDE
// teruggeeft in plaats van te navigeren — de echte zoekactie blijft het GET-formulier.
//
// Volgorde volgens docs/INVOERVALIDATIE.md: sessiepoort → schema-parse → repo. De teller
// telt via countSearchMatches langs exact dezelfde WHERE-bouwers als de zoekopdracht zelf.
import { db } from "@/db/client";
import { countSearchMatches } from "@/lib/repo/products";
import { requireSession } from "@/lib/session";
import { parseForm } from "@/lib/validation";
import {
  ipNumber,
  zCatalogZoek,
  type CountOutcome,
} from "@/lib/catalog-zoekvorm";

export async function countCatalogMatches(
  formData: FormData,
): Promise<CountOutcome> {
  await requireSession();
  const parsed = parseForm(zCatalogZoek, formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { brand, q, kelvin, cri, ip } = parsed.data;
  // Geen `actor` mee: `countSearchMatches` logt bewust niet (zie de kop daar), en een
  // actor meegeven aan een functie die hem nergens gebruikt suggereert dat er wél iets
  // vastgelegd wordt. De sessiepoort hierboven blijft; die gaat over mógen, niet over meten.
  const { total, verbreed, herkend } = await countSearchMatches(db, {
    query: q,
    brand,
    filters: { kelvin, cri, ip: ipNumber(ip) },
  });
  return { ok: true, total, verbreed, herkend };
}
