// Bericht klaarzetten (stap 7, K6): pure NL-tekstgenerator voor de mail aan het merk.
// Geen mailverzending — de tekst gaat via een readonly-textarea + kopieerknop.
//
// Lek-preventie (reviewer-eis): de tekst benoemt UITSLUITEND niet-🔒-informatie.
// Dat is hier structureel geborgd: de dekkingscijfers komen uit bucketScore, die alleen
// meetbare velden telt — en álle internalOnly-velden zijn kind "none" (zie de assert in
// lib/field-catalog.test.ts). Veldnamen zelf komen nooit in de tekst; alleen
// bucketlabels en percentages. De negatieve test hieronder toetst het alsnog expliciet.
import type { BucketScore } from "@/lib/field-catalog";
import type { CatalogBucket } from "@/lib/field-catalog";
import type { PriceListIndicator } from "@/lib/repo/brand-relations";

export type BrandMessageInput = {
  brandName: string;
  contactName: string | null;
  productCount: number;
  priceListIndicator: PriceListIndicator;
  priceListValidUntil: string | null; // ISO-datum (yyyy-mm-dd) of null
  buckets: { bucket: CatalogBucket; score: BucketScore }[];
};

// Hoeveel "slechtste" buckets we maximaal benoemen — meer wordt een waslijst.
const MAX_BUCKETS_IN_TEKST = 3;

function datumNl(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const maanden = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${maanden[(m ?? 1) - 1]} ${y}`;
}

// Gecombineerde must+wanna-dekking van een bucket (gewogen naar aantal velden).
// null = niets meetbaars op must/wanna-niveau → bucket telt niet mee in het bericht.
function dekking(score: BucketScore): number | null {
  const total = score.must.total + score.wanna.total;
  if (total === 0) return null;
  return (
    (score.must.ratio * score.must.total + score.wanna.ratio * score.wanna.total) /
    total
  );
}

export function buildBrandMessage(input: BrandMessageInput): string {
  const regels: string[] = [];

  regels.push(
    input.contactName
      ? `Dear ${input.contactName},`
      : "Dear Sir or Madam,",
  );
  regels.push("");
  regels.push(
    `At Brink Licht we are building the most complete product database possible, so we can include ${input.brandName} optimally in our lighting advice and quotes.`,
  );

  // Prijslijst-status in gewone taal.
  if (input.priceListIndicator === "ontbreekt") {
    regels.push("");
    regels.push(
      "We currently don't have a price list from you. Could you send us your current price list?",
    );
  } else if (input.priceListIndicator === "verlopen") {
    regels.push("");
    regels.push(
      input.priceListValidUntil
        ? `Your price list has expired (valid until ${datumNl(input.priceListValidUntil)}). Could you send us a current price list?`
        : "Your price list has expired. Could you send us a current price list?",
    );
  } else if (input.priceListIndicator === "verloopt_binnenkort") {
    regels.push("");
    regels.push(
      input.priceListValidUntil
        ? `Your price list expires soon (on ${datumNl(input.priceListValidUntil)}). Could you send us a new price list in good time?`
        : "Your price list expires soon. Could you send us a new price list in good time?",
    );
  }

  // Buckets met de laagste must/wanna-dekking, in gewone taal.
  const laagste = input.buckets
    .map(({ bucket, score }) => ({ bucket, ratio: dekking(score) }))
    .filter((b): b is { bucket: CatalogBucket; ratio: number } => b.ratio !== null)
    .filter((b) => b.ratio < 1)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, MAX_BUCKETS_IN_TEKST);

  if (input.productCount > 0 && laagste.length > 0) {
    regels.push("");
    regels.push(
      `Of your ${input.productCount} ${input.productCount === 1 ? "product" : "products"} in our database, we are mainly missing data on the following points:`,
    );
    for (const { bucket, ratio } of laagste) {
      const missend = Math.round((1 - ratio) * 100);
      regels.push(
        `- ${bucket.labelEn}: incomplete for about ${missend}% of the products.`,
      );
    }
  } else if (input.productCount > 0) {
    regels.push("");
    regels.push(
      "The product data we have from you is — as far as we can measure — complete. Thank you for that!",
    );
  }

  regels.push("");
  regels.push(
    "Attached you'll find our Excel template (brinklicht-product-data-template.xlsx). Could you fill it in per product? Fields that don't apply to your products can simply be left empty.",
  );
  regels.push("");
  regels.push("Thank you in advance for your effort.");
  regels.push("");
  regels.push("Kind regards,");
  regels.push("Brink Licht");

  return regels.join("\n");
}
