"use server";

// Server-acties van /data/fields (sprint 1.8). Deze acties lezen FormData, eisen een
// sessie en delegeren naar lib/repo/custom-fields.ts — de enige schrijver van
// velddefinities, die ook zelf de events logt (regel 5; val 7 uit fase 1: erop rekenen
// dat een bestaand pad meelogt is precies hoe 1.7 bijna een veld stil liet wegvallen).
//
// DRIE DINGEN WORDEN HIER BEWUST GETOETST, NIET IN DE BROWSER:
//  1. Label en instructie (beide Engels) niet-leeg. `required` in het formulier is een
//     hint, geen contract — een POST kan er zo omheen.
//  2. bucketKey is een van de 10 template-buckets. Nooit "intern": een eigen veld gaat
//     per definitie naar het merk, en bucket 11 is juist wat we NIET vragen.
//  3. Labelbotsing op het GENORMALISEERDE label (labelBotsing() → normLabel()). Dit is de
//     duurste fout van dit item: twee kolommen die op hetzelfde veld matchen leveren
//     `dubbele_kolomkop` op, en dat is een harde afwijzing van het HELE bestand — voor
//     elk merk tegelijk, tot iemand het veld hernoemt. Eigen↔eigen vangt de partiële
//     unique index ook af; eigen↔catalogus kan de database niet weten (die 66 labels
//     leven in TypeScript), dus die grens ligt hier.
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { labelBotsing } from "@/lib/custom-fields";
import {
  FIELD_CATALOG,
  INTERNAL_BUCKET_KEY,
  type Compleetheidsniveau,
} from "@/lib/field-catalog";
import {
  archiveEigenVeld,
  createEigenVeld,
  listEigenVelden,
  telProductenMetWaarde,
  updateEigenVeld,
} from "@/lib/repo/custom-fields";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";

// `void` hoort in de union omdat het formulier (useActionState) hem zo typeert: een
// no-op action in de screenshot-test levert niets terug. Hier retourneren we altijd
// óf null óf een zin.
export type VeldActieState = { error: string } | null | void;

const NIVEAUS: Compleetheidsniveau[] = ["must", "wanna", "nice"];

const TEMPLATE_BUCKET_KEYS = FIELD_CATALOG.filter(
  (b) => b.key !== INTERNAL_BUCKET_KEY,
).map((b) => b.key);

const tekst = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();

type Invoer = {
  labelEn: string;
  instructionEn: string;
  niveau: Compleetheidsniveau;
  bucketKey: string;
};

/** Leest en toetst het formulier. Retourneert óf de invoer óf één zin die uitlegt wat
 *  eraan schort — nooit een half ingevuld object. */
function leesInvoer(formData: FormData): Invoer | { error: string } {
  const labelEn = tekst(formData, "labelEn");
  const instructionEn = tekst(formData, "instructionEn");
  if (!labelEn) {
    return {
      error: "A label is required — it is the column header the brand sees (row 2).",
    };
  }
  if (!instructionEn) {
    return {
      error:
        "An instruction is required. Row 3 of the brand Excel is the instruction; a column without one is a column nobody fills in.",
    };
  }
  const niveau = tekst(formData, "niveau") as Compleetheidsniveau;
  if (!NIVEAUS.includes(niveau)) return { error: "Pick a level." };
  const bucketKey = tekst(formData, "bucketKey");
  if (!TEMPLATE_BUCKET_KEYS.includes(bucketKey)) {
    return { error: "Pick one of the ten template categories." };
  }
  return { labelEn, instructionEn, niveau, bucketKey };
}

function botsingsZin(
  botsing: { met: "catalogus" | "eigen"; bestaandLabelEn: string },
): string {
  return botsing.met === "catalogus"
    ? `“${botsing.bestaandLabelEn}” is already a catalogue field. Two columns with the same header make every filled brand file unreadable, so pick another label — or use the existing field.`
    : `You already have a field called “${botsing.bestaandLabelEn}”. Two columns with the same header make every filled brand file unreadable.`;
}

function herteken() {
  revalidatePath("/data/fields");
  // De catalogus voedt het merk-Excel én de scorecards; die schermen tonen anders het
  // oude aantal kolommen.
  revalidatePath("/data/brand-relations");
  revalidatePath("/data");
}

export async function createCustomFieldAction(
  _state: VeldActieState,
  formData: FormData,
): Promise<VeldActieState> {
  await bewaakNiveau("intern", "/data/fields");
  const invoer = leesInvoer(formData);
  if ("error" in invoer) return invoer;

  const bestaand = await listEigenVelden(db);
  const botsing = labelBotsing(invoer.labelEn, bestaand);
  if (botsing) return { error: botsingsZin(botsing) };

  await createEigenVeld(db, invoer, await getActor());
  herteken();
  return null;
}

export async function updateCustomFieldAction(
  _state: VeldActieState,
  formData: FormData,
): Promise<VeldActieState> {
  await bewaakNiveau("intern", "/data/fields");
  const id = tekst(formData, "id");
  if (!id) return { error: "Unknown field." };
  const invoer = leesInvoer(formData);
  if ("error" in invoer) return invoer;

  // negeerId: hernoemen naar je eigen huidige label mag natuurlijk wél.
  const bestaand = await listEigenVelden(db);
  const botsing = labelBotsing(invoer.labelEn, bestaand, id);
  if (botsing) return { error: botsingsZin(botsing) };

  await updateEigenVeld(db, id, invoer, await getActor());
  herteken();
  return null;
}

/** Verse telling vóór de archiveer-bevestiging. Het getal in de tabel komt van de
 *  page-render en kan minuten oud zijn; een bevestiging die een verouderd aantal noemt is
 *  precies het soort halve waarheid dat dit project niet wil. */
export async function countProductsWithValueAction(
  id: string,
): Promise<{ productsWithValue: number }> {
  await bewaakNiveau("intern", "/data/fields");
  const perVeld = await telProductenMetWaarde(db);
  return { productsWithValue: perVeld.get(id) ?? 0 };
}

/** Soft delete: de definitie krijgt archived_at, de WAARDEN blijven staan. Ze wissen zou
 *  een mass-update over productrijen zijn, `updated_at` verzetten en de fingerprint-
 *  discipline van elke volgende sprint breken. */
export async function archiveCustomFieldAction(
  id: string,
): Promise<{ ok: boolean }> {
  await bewaakNiveau("intern", "/data/fields");
  if (!id) return { ok: false };
  const uitkomst = await archiveEigenVeld(db, id, await getActor());
  if (uitkomst.ok) herteken();
  return { ok: uitkomst.ok };
}
