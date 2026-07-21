// Eigen velden (sprint 1.8): de velddefinities die Stefan zelf aanmaakt, gemengd in de
// veldcatalogus van lib/field-catalog.ts.
//
// PUUR: geen imports uit db/, lib/repo/ of app/. Dat is geen stijlvoorkeur maar de reden
// dat dit bestand bestaat. `excelColumns()` c.s. zijn synchroon en puur — lib/excel-validate.ts
// en lib/template-diff.ts dragen die zuiverheid uitdrukkelijk als ontwerpdoel voor 4.B
// (merkportaal-self-serve). De velddefinities staan in de database. De oplossing is dus:
// de catalogus gaat als PARAMETER door de pure laag heen, en de enige plek die hem uit de
// database haalt is lib/repo/custom-fields.ts.
//
// DE SLEUTEL IS EEN UUID, geen slug van het label. Hernoemen is toegestaan; een sleutel
// `cf_energieverbruik` op een veld dat inmiddels "Recycled content" heet is precies de
// stille mismatch waar dit project een geschiedenis mee heeft (`name_en: col("name")`,
// jarenlang onopgemerkt omdat `name` bestáát). De uuid is ondoorzichtig maar eerlijk, kan
// per constructie niet botsen met een catalog-key (die zijn ^[a-z0-9_]+$) en overleeft
// hernoemen. Het leesbaarheidsverlies is gedekt doordat elk event labelEn meedraagt.
import { normLabel } from "@/lib/excel-validate";
import {
  FIELD_CATALOG,
  type CatalogBucket,
  type CatalogField,
  type Compleetheidsniveau,
} from "@/lib/field-catalog";

/** Prefix van de veldcatalogus-key van een eigen veld. De dubbele punt kan per constructie
 *  niet in een catalog-key voorkomen (^[a-z0-9_]+$) en is veilig in de selectie-sleutels van
 *  het retour-pad: selectieUit() toetst alleen ^r\d+\. en applyTemplateProposal bouwt de
 *  sleutel opnieuw op met fieldSelectionKey() — de fieldKey wordt nergens uit een
 *  samengestelde string terug-geparsed. */
export const EIGEN_VELD_PREFIX = "custom:" as const;

export type EigenVeldDef = {
  /** uuid, PK van custom_fields; óók de sleutel in products.custom_values */
  id: string;
  labelNl: string;
  labelEn: string; // de Excel-kolomkop (rij 2)
  instructieNl: string;
  instructionEn: string; // rij 3 van het Excel
  niveau: Compleetheidsniveau;
  /** key van een van de 10 template-buckets; nooit "intern" */
  bucketKey: string;
  /** ISO; bepaalt de volgorde binnen de bucket */
  createdAt: string;
  /** null = actief */
  archivedAt: string | null;
};

export function eigenVeldKey(def: Pick<EigenVeldDef, "id">): string {
  return EIGEN_VELD_PREFIX + def.id;
}

export function isEigenVeldKey(fieldKey: string): boolean {
  return fieldKey.startsWith(EIGEN_VELD_PREFIX);
}

/** De uuid uit een veldcatalogus-key, of null als het geen eigen veld is. */
export function eigenVeldIdVan(fieldKey: string): string | null {
  return isEigenVeldKey(fieldKey)
    ? fieldKey.slice(EIGEN_VELD_PREFIX.length)
    : null;
}

/**
 * Velddefinitie → catalogusveld. `measure` is voor élk eigen veld DEZELFDE vorm met alleen
 * een andere fieldId — er is geen per-veld kolomkeuze en dus niets dat uit sync kan lopen.
 * De meting zelf zet die fieldId als BOUND PARAMETER in de query (lib/repo/brand-relations.ts);
 * een gebruikersgekozen identifier komt nooit in de SQL-tekst.
 *
 * `matcher: false` is geen belofte maar een feit: de waarde leeft in products.custom_values,
 * en die kolom staat in geen enkele view die de match-engine leest.
 * `inExcel: true` zonder opt-out: er is vandaag geen ander invoerkanaal (het
 * merkportaal-schrijfpad is 4.B), dus een veld met inExcel:false zou gegarandeerd voor
 * altijd leeg blijven.
 */
export function alsCatalogField(def: EigenVeldDef): CatalogField {
  return {
    key: eigenVeldKey(def),
    labelNl: def.labelNl,
    labelEn: def.labelEn,
    niveau: def.niveau,
    matcher: false,
    internalOnly: false,
    inExcel: true,
    instructie: def.instructieNl,
    instructionEn: def.instructionEn,
    measure: { kind: "custom", fieldId: def.id },
  };
}

/**
 * De veldcatalogus mét de eigen velden erin gemengd: kopie van FIELD_CATALOG, actieve eigen
 * velden achteraan hun bucket, gesorteerd op (createdAt, id).
 *
 * MUTEERT FIELD_CATALOG NOOIT — die constante is module-globaal en gedeeld; hem in-place
 * uitbreiden zou betekenen dat de tweede aanroep in hetzelfde proces een dubbele lijst geeft.
 * Achteraan de bucket en niet gesorteerd op label: de bestaande 66 kolommen van het merk-Excel
 * houden zo hun plek, ook nadat er velden bij komen.
 *
 * Een eigen veld met een onbekende of gearchiveerde bucketKey valt er stil uit — dat kan
 * alleen als iemand een bucket uit FIELD_CATALOG verwijdert, en dan is stil verdwijnen uit
 * het Excel beter dan een elfde categorie die de scorecard-noemer ontregelt.
 */
export function catalogusMet(eigen: readonly EigenVeldDef[]): CatalogBucket[] {
  const actief = eigen
    .filter((d) => d.archivedAt === null)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  const perBucket = new Map<string, EigenVeldDef[]>();
  for (const def of actief) {
    perBucket.set(def.bucketKey, [...(perBucket.get(def.bucketKey) ?? []), def]);
  }

  return FIELD_CATALOG.map((bucket) => {
    const extra = perBucket.get(bucket.key);
    if (!extra || extra.length === 0) return { ...bucket, fields: [...bucket.fields] };
    return { ...bucket, fields: [...bucket.fields, ...extra.map(alsCatalogField)] };
  });
}

/**
 * Botst deze Engelse kolomkop met een bestaand veld? `null` = vrij.
 *
 * Waarom dit hard moet: twee kolommen die op hetzelfde veld matchen leveren in de validator
 * `dubbele_kolomkop` op, en dat is een AFWIJZING VAN HET HELE BESTAND. Eén eigen veld met een
 * botsend label maakt dus élk ingevuld merkbestand onbruikbaar, voor alle merken tegelijk,
 * tot iemand het veld hernoemt.
 *
 * Vergelijkt via normLabel() uit lib/excel-validate.ts — dezelfde normalisatie die de
 * validator gebruikt, niet een tweede kopie ervan. Een tweede kopie is precies hoe je een
 * botsing krijgt die de aanmaakcheck niet ziet en de validator wél.
 *
 * `negeerId` is voor HERNOEMEN: een veld botst niet met zichzelf. De botsing kan namelijk
 * óók bij hernoemen ontstaan, niet alleen bij aanmaken.
 *
 * Toetst tegen ÁLLE catalogusvelden, ook de 🔒-interne: die staan weliswaar niet in het
 * Excel, maar wél in de scorecard, en twee identieke labels in één scherm is een leugen.
 * Gearchiveerde eigen velden tellen niet mee — hun label is weer vrij (de unique index in
 * 0015 is om dezelfde reden partieel).
 */
export function labelBotsing(
  labelEn: string,
  eigen: readonly EigenVeldDef[],
  negeerId?: string,
): { met: "catalogus" | "eigen"; bestaandLabelEn: string } | null {
  const norm = normLabel(labelEn);
  if (norm === "") return null;

  for (const bucket of FIELD_CATALOG) {
    for (const field of bucket.fields) {
      if (normLabel(field.labelEn) === norm) {
        return { met: "catalogus", bestaandLabelEn: field.labelEn };
      }
    }
  }
  for (const def of eigen) {
    if (def.archivedAt !== null) continue;
    if (negeerId !== undefined && def.id === negeerId) continue;
    if (normLabel(def.labelEn) === norm) {
      return { met: "eigen", bestaandLabelEn: def.labelEn };
    }
  }
  return null;
}
