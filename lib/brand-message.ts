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
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
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
      ? `Beste ${input.contactName},`
      : "Geachte heer/mevrouw,",
  );
  regels.push("");
  regels.push(
    `Bij Brink Licht werken we aan een zo compleet mogelijk productdatabestand, zodat we ${input.brandName} optimaal kunnen meenemen in onze lichtadviezen en offertes.`,
  );

  // Prijslijst-status in gewone taal.
  if (input.priceListIndicator === "ontbreekt") {
    regels.push("");
    regels.push(
      "We hebben op dit moment nog geen prijslijst van u. Zou u ons uw actuele prijslijst kunnen toesturen?",
    );
  } else if (input.priceListIndicator === "verlopen") {
    regels.push("");
    regels.push(
      input.priceListValidUntil
        ? `Uw prijslijst is verlopen (geldig tot ${datumNl(input.priceListValidUntil)}). Zou u ons een actuele prijslijst kunnen toesturen?`
        : "Uw prijslijst is verlopen. Zou u ons een actuele prijslijst kunnen toesturen?",
    );
  } else if (input.priceListIndicator === "verloopt_binnenkort") {
    regels.push("");
    regels.push(
      input.priceListValidUntil
        ? `Uw prijslijst verloopt binnenkort (op ${datumNl(input.priceListValidUntil)}). Zou u ons tijdig een nieuwe prijslijst kunnen toesturen?`
        : "Uw prijslijst verloopt binnenkort. Zou u ons tijdig een nieuwe prijslijst kunnen toesturen?",
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
      `Van uw ${input.productCount} ${input.productCount === 1 ? "product" : "producten"} in ons bestand missen we vooral gegevens op de volgende punten:`,
    );
    for (const { bucket, ratio } of laagste) {
      const missend = Math.round((1 - ratio) * 100);
      regels.push(
        `- ${bucket.labelNl}: bij ongeveer ${missend}% van de producten onvolledig.`,
      );
    }
  } else if (input.productCount > 0) {
    regels.push("");
    regels.push(
      "De productdata die wij van u hebben is — voor zover wij dat kunnen meten — compleet. Dank daarvoor!",
    );
  }

  regels.push("");
  regels.push(
    "In de bijlage vindt u ons Excel-template (brinklicht-product-data-template.xlsx). Zou u dit per product willen invullen? Velden die voor uw producten niet van toepassing zijn, mag u gewoon leeglaten.",
  );
  regels.push("");
  regels.push("Alvast hartelijk dank voor uw moeite.");
  regels.push("");
  regels.push("Met vriendelijke groet,");
  regels.push("Brink Licht");

  return regels.join("\n");
}
