"use server";

// Server-acties voor merkbeheer (sprint 1.5). Precedent: app/data/brand-relations/actions.ts.
// app/admin/actions.ts blijft van tier en uploads.
//
// Twee dingen die hier het ontwerp dragen:
//   • Elke terugkerende state draagt `values`. Zonder JavaScript rendert de pagina na de
//     POST opnieuw; zonder values staat het formulier dan leeg en is de waarschuwing die
//     de gebruiker bewust moet lezen de straf voor het invullen. Dit is het enige punt
//     waar dit ontwerp stil kan falen.
//   • De bevestigingssleutel is de match-set zelf (duplicateToken), geen vinkje: wijzigt
//     de naam tussen waarschuwing en bevestiging, dan is de waarschuwing weer vers.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import type { BrandLifecycle } from "@/db/schema";
import {
  createBrand,
  deleteBrand,
  duplicateToken,
  findBrandDuplicates,
  getBrandDeleteImpact,
  setBrandLifecycle,
  updateBrand,
  type BrandDeleteImpact,
  type BrandDuplicate,
  type BrandInput,
} from "@/lib/repo/brands";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";

const LIFECYCLES: BrandLifecycle[] = ["actief", "slapend", "bestaat_niet_meer"];

export type BrandFormValues = {
  name: string;
  brandCode: string;
  country: string;
  website: string;
  descriptionNl: string;
  lifecycle: BrandLifecycle;
  // Milieuvelden (1.7): ruwe formulierstrings — km is hier nog geen getal, dat gebeurt
  // pas in toInput(), zodat een ongeldige waarde als tekst kan terugreizen naar het
  // formulier (het no-JS-contract).
  factoryLocation: string;
  factoryDistanceKm: string;
};

export type BrandFormState =
  | { status: "idle" }
  | { status: "error"; message: string; values: BrandFormValues }
  | {
      status: "duplicate";
      token: string;
      matches: BrandDuplicate[];
      values: BrandFormValues;
    };

function readValues(formData: FormData): BrandFormValues {
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const lifecycle = str("lifecycle") as BrandLifecycle;
  return {
    name: str("name"),
    brandCode: str("brandCode"),
    country: str("country"),
    website: str("website"),
    descriptionNl: str("descriptionNl"),
    lifecycle: LIFECYCLES.includes(lifecycle) ? lifecycle : "actief",
    factoryLocation: str("factoryLocation"),
    factoryDistanceKm: str("factoryDistanceKm"),
  };
}

// Lege tekstvelden worden NULL, niet "": een leeg veld is geen waarde. Dat geldt ook voor
// de kilometers: een lege string wordt null, nooit 0 (0 zou "de fabriek staat in Utrecht"
// betekenen — zie migratie 0014). validateEnvironment() heeft al gegarandeerd dat een
// niet-lege waarde hier een geldig cijfer-alleen getal ≥ 1 is.
function toInput(values: BrandFormValues): BrandInput {
  return {
    name: values.name,
    brandCode: values.brandCode || null,
    country: values.country || null,
    website: values.website || null,
    descriptionNl: values.descriptionNl || null,
    lifecycle: values.lifecycle,
    factoryLocation: values.factoryLocation || null,
    factoryDistanceKm: values.factoryDistanceKm
      ? Number(values.factoryDistanceKm)
      : null,
  };
}

// Vóór de duplicateGate: km is óf leeg, óf een geheel getal ≥ 1 (sub-kilometerprecisie is
// schijnnauwkeurigheid, en 0 is gereserveerd voor "leeg" — zie migratie 0014). Km zonder
// locatie levert een uitgelegde fout op: zonder locatie is de afstand niet te controleren.
function validateEnvironment(values: BrandFormValues): string | null {
  const km = values.factoryDistanceKm.trim();
  if (km !== "" && !/^\d+$/.test(km)) {
    return "Distance to Brink must be a whole number of kilometers, or left empty.";
  }
  if (km !== "" && Number(km) < 1) {
    return "Distance to Brink must be at least 1 km, or left empty.";
  }
  if (km !== "" && !values.factoryLocation.trim()) {
    return "A distance without a factory location can't be checked — add the location too.";
  }
  return null;
}

// Dubbelcheck-poort, gedeeld door create en update: match gevonden én de meegestuurde
// token hoort niet bij déze match-set → er wordt NIETS geschreven.
async function duplicateGate(
  values: BrandFormValues,
  formData: FormData,
  excludeId?: string,
): Promise<
  | { proceed: true; duplicateOf: string[] }
  | { proceed: false; state: BrandFormState }
> {
  const matches = await findBrandDuplicates(db, {
    name: values.name,
    brandCode: values.brandCode || null,
    excludeId,
  });
  if (matches.length === 0) return { proceed: true, duplicateOf: [] };

  const token = duplicateToken(matches);
  if (String(formData.get("confirmToken") ?? "") !== token) {
    return {
      proceed: false,
      state: { status: "duplicate", token, matches, values },
    };
  }
  return { proceed: true, duplicateOf: matches.map((m) => m.id) };
}

export async function createBrandAction(
  prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  await bewaakNiveau("intern", "/admin/brands");
  const values = readValues(formData);
  if (!values.name) {
    return { status: "error", message: "Merknaam is verplicht.", values };
  }
  const envError = validateEnvironment(values);
  if (envError) {
    return { status: "error", message: envError, values };
  }

  const gate = await duplicateGate(values, formData);
  if (!gate.proceed) return gate.state;

  const { id } = await createBrand(db, toInput(values), await getActor(), {
    duplicateOf: gate.duplicateOf,
  });

  revalidatePath("/admin/brands");
  revalidatePath("/admin");
  revalidatePath("/data/brand-relations");
  // redirect() gooit intern — daarom ná de revalidatePaths en buiten elke try/catch.
  // Succes is een scherm (het verse merk), geen melding.
  redirect(`/admin/brands/${id}`);
}

export async function updateBrandAction(
  prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  await bewaakNiveau("intern", "/admin/brands");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const values = readValues(formData);
  if (!brandId) {
    return { status: "error", message: "Onbekend merk.", values };
  }
  if (!values.name) {
    return { status: "error", message: "Merknaam is verplicht.", values };
  }
  const envError = validateEnvironment(values);
  if (envError) {
    return { status: "error", message: envError, values };
  }

  // excludeId: bij bewerken is het merk zelf geen dubbele.
  const gate = await duplicateGate(values, formData, brandId);
  if (!gate.proceed) return gate.state;

  await updateBrand(db, brandId, toInput(values), await getActor(), {
    duplicateOf: gate.duplicateOf,
  });

  revalidatePath("/admin/brands");
  revalidatePath(`/admin/brands/${brandId}`);
  revalidatePath("/admin");
  revalidatePath("/data/brand-relations");
  return { status: "idle" };
}

// De uitweg naast de verwijderblokkade (G4), als losse actie zodat hij in hetzelfde blok
// als het verwijderpaneel kan staan. Ongeldige waarde → geen wijziging (fail-safe).
export async function setBrandLifecycleAction(formData: FormData): Promise<void> {
  await bewaakNiveau("intern", "/admin/brands");
  const brandId = String(formData.get("brandId") ?? "").trim();
  const lifecycle = String(formData.get("lifecycle") ?? "").trim() as BrandLifecycle;
  if (!brandId || !LIFECYCLES.includes(lifecycle)) return;

  await setBrandLifecycle(db, brandId, lifecycle, await getActor());
  revalidatePath("/admin/brands");
  revalidatePath(`/admin/brands/${brandId}`);
  revalidatePath("/admin");
  revalidatePath("/data/brand-relations");
}

export type BrandDeleteState =
  | { status: "idle" }
  | { status: "confirm"; impact: BrandDeleteImpact }
  | { status: "blocked"; impact: BrandDeleteImpact }
  | { status: "error"; message: string };

// Tweefasig: eerste klik toont de cascade-lijst uitgeschreven, tweede klik voert uit.
// Eén database is dev én prod — die tweede klik is niet overdreven.
export async function deleteBrandAction(
  prev: BrandDeleteState,
  formData: FormData,
): Promise<BrandDeleteState> {
  await bewaakNiveau("intern", "/admin/brands");
  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Onbekend merk." };

  if (String(formData.get("confirm") ?? "") !== "1") {
    const impact = await getBrandDeleteImpact(db, brandId);
    return impact.blocked
      ? { status: "blocked", impact }
      : { status: "confirm", impact };
  }

  const result = await deleteBrand(db, brandId, await getActor());
  if (!result.ok) return { status: "blocked", impact: result.impact };

  revalidatePath("/admin/brands");
  revalidatePath("/admin");
  revalidatePath("/data/brand-relations");
  redirect("/admin/brands");
}
