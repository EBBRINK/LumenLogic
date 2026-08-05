"use server";

// Prijslijst verlengen (bevinding B3) — de ontbrekende ingang bij de melding die al op vier
// schermen staat: "What's needed now is an extension, not a new submission." Die zin klopte
// inhoudelijk, maar er was nergens code die valid_until vooruit kon zetten; het merk had
// geleverd, de lijst was verlopen en het werk stond stil.
//
// DEZE LAAG SCHRIJFT NIETS ZELF (zelfde afspraak als upload-actions.ts): sessie eisen,
// FormData uitlezen, vorm-controle, en dan lib/repo/price-archive.ts laten schrijven. Het
// event (ijzeren regel 5) wordt daar gelogd, bij de schrijf zelf — een action die logt maar
// niet schrijft liegt bij een crash ertussenin.
//
// Geen client component, dus ook geen callAction(): de knop zit in een kaal
// `<form action={…}>` in een server component. De terugkoppeling loopt via de URL en wordt
// door de pagina gerenderd. (Zie de callAction-waarschuwing in CLAUDE.md: dat gevaar geldt
// het kanaal client-promise → NEXT_REDIRECT, en dat kanaal bestaat hier niet.)
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import {
  extendPriceListValidity,
  PriceListExtendError,
} from "@/lib/repo/price-archive";
import { isUuid } from "@/lib/uuid";
import { getActor } from "@/lib/session";
import { bewaakNiveau } from "@/lib/route-toegang";

// TODO (invoervalidatie): expliciete guards, om te zetten naar `lib/validation.ts` zodra die
// geland is (parallelle sessie, zie docs/INVOERVALIDATIE.md). Bewust géén import nu — die
// module bestaat in deze tak nog niet en een halve koppeling is erger dan geen.
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** De verloop-melding staat op élk merkscherm; na een verlenging mogen ze niet uiteenlopen.
 *  Zelfde set als herlaadMerkschermen() in upload-actions.ts, plus de twee schermen die de
 *  prijslijst-status zelf tonen. */
function herlaadVerloopschermen(brandId: string | null) {
  revalidatePath("/data/price-lists");
  revalidatePath("/data/brand-relations");
  if (brandId) revalidatePath(`/data/brand-relations/${brandId}`);
  revalidatePath("/admin/brands");
  revalidatePath("/data");
}

/**
 * Zet de einddatum van één prijslijst vooruit en komt terug op /data/price-lists met de
 * uitkomst in de URL (`?extend=ok&until=…` of `?extend=<reden>`). Alleen codes in die URL,
 * geen doorgegeven foutteksten: de pagina maakt er een zin van, zodat de UI-taal op één plek
 * staat en er nooit ruwe database-tekst in de adresbalk belandt.
 */
export async function extendPriceListAction(formData: FormData) {
  await bewaakNiveau("intern", "/data/price-lists");

  const priceListId = String(formData.get("priceListId") ?? "").trim();
  const validUntil = String(formData.get("validUntil") ?? "").trim();

  const uitkomst = new URLSearchParams();
  let brandId: string | null = null;

  if (!isUuid(priceListId)) {
    // Nooit een niet-uuid de uuid-kolom in: Postgres gooit daarop een 500 (zie lib/uuid.ts).
    uitkomst.set("extend", "unknown_list");
  } else if (!ISO_DATUM.test(validUntil)) {
    // Een leeg datumveld komt hier ook binnen: `<input type="date">` stuurt dan "".
    uitkomst.set("extend", "invalid_date");
  } else {
    try {
      const bijgewerkt = await extendPriceListValidity(db, {
        priceListId,
        validUntil,
        actor: await getActor(),
      });
      brandId = bijgewerkt.brandId;
      uitkomst.set("extend", "ok");
      uitkomst.set("until", bijgewerkt.validUntil);
    } catch (fout) {
      // Alleen de weigeringen van de repo-laag vertalen; al het andere (een kapotte
      // verbinding, een schema-fout) hoort een echte 500 te blijven en niet als nette
      // gele melding op het scherm te eindigen.
      if (!(fout instanceof PriceListExtendError)) throw fout;
      uitkomst.set("extend", fout.reason);
    }
  }

  herlaadVerloopschermen(brandId);
  // redirect() gooit intern (NEXT_REDIRECT) — daarom ná de revalidatePaths en buiten de
  // try/catch hierboven; in dat blok zou de catch het navigatiesignaal opeten.
  redirect(`/data/price-lists?${uitkomst.toString()}`);
}
