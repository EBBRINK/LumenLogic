// Teksten bij lib/excel-validate.ts. Apart bestand, en dat is het hele punt: de validator
// levert codes + parameters, deze module maakt er zinnen van. Daardoor heeft de validator
// geen publiek en dus geen smaken — 1.2 (Brink leest de melding) en 4.B (het MERK leest
// hem) delen dezelfde validator en kunnen desgewenst een eigen renderer zetten zonder één
// byte in de validator te wijzigen.
//
// TAAL — bewuste afwijking van kaderpunt 4 van docs/sprint1-1-briefing.md, gemeld aan de
// sprintmaster: dat kader zegt "meldingen in het Nederlands — de interne UI is Nederlands",
// maar dat klopt sinds de i18n-slag niet meer (docs/i18n-glossary-xis.md; /data/brand-
// relations toont "Brand relations"). Beide publieken lezen vandaag Engels: Brink in de
// interne UI, en de merken in 4.B zijn internationaal (het template is óók Engels).
// De kaders zijn expliciet "aanbevelingen — plan-agents mogen beargumenteerd afwijken".
// Blijkt Nederlands tóch gewenst: dat is een wijziging van dít bestand van ~60 regels,
// niet van de module. Code-commentaar blijft Nederlands (i18n-glossary regel 5).
import {
  EERSTE_DATARIJ,
  KOPRIJ,
  type AfwijzingsReden,
  type RijWaarschuwing,
} from "@/lib/excel-validate";

/** 1-based kolomnummer → Excel-kolomletter (1 → A, 27 → AA). Puur presentatie, dus hier
 *  en niet in de validator: het is een functie van iets dat die al teruggeeft. */
export function kolomLetter(kolom: number): string {
  let n = kolom;
  let uit = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    uit = String.fromCharCode(65 + rest) + uit;
    n = Math.floor((n - 1) / 26);
  }
  return uit;
}

const lijst = (items: string[]): string => items.join(", ");

/** Eén zin voor bovenaan het scherm bij een format-afwijzing, mét wat er mist. */
export function afwijzingsTekst(reden: AfwijzingsReden): string {
  switch (reden.code) {
    case "onleesbaar_bestand":
      return `We could not open this file. Please make sure it is the .xlsx template you downloaded from us — older .xls files, CSV files renamed to .xlsx, and password-protected files cannot be read. (Technical detail: ${reden.detail})`;
    case "werkblad_ontbreekt":
      return reden.gevondenWerkbladen.length > 0
        ? `This is not our format: the sheet "${reden.verwacht}" is missing. We found these sheets instead: ${lijst(reden.gevondenWerkbladen.map((n) => `"${n}"`))}. Please fill in the template you downloaded from us, without renaming the sheet.`
        : `This is not our format: the sheet "${reden.verwacht}" is missing and the file contains no sheets at all.`;
    case "koprij_niet_herkend":
      return reden.labelsGevondenOpRij !== null
        ? `This is our template, but the field names are on row ${reden.labelsGevondenOpRij} instead of row ${KOPRIJ}. Rows appear to have been inserted above or removed from the table. Please restore the three header rows (row 1 groups, row ${KOPRIJ} field names, row 3 instructions) and put your data from row ${EERSTE_DATARIJ} onwards.`
        : `This is not our format: row ${KOPRIJ} does not contain any of our field names, so this does not look like our template. Please download the template again and fill it in. (We read on row ${KOPRIJ}: ${reden.gelezenKoprij.length > 0 ? lijst(reden.gelezenKoprij.slice(0, 8).map((t) => `"${t}"`)) : "nothing"}.)`;
    case "must_kolommen_ontbreken":
      return `This is our template, but ${reden.ontbrekend.length === 1 ? "a required column is" : "required columns are"} missing: ${lijst(reden.ontbrekend.map((k) => `"${k.labelEn}"`))}. ${reden.ontbrekend.length === 1 ? "This column" : "These columns"} must be present — please add ${reden.ontbrekend.length === 1 ? "it" : "them"} with the exact heading${reden.ontbrekend.length === 1 ? "" : "s"} above and upload the file again. Nothing has been saved.`;
    case "dubbele_kolomkop":
      return `The column "${reden.labelEn}" appears more than once (column ${lijst(reden.kolommen.map(kolomLetter))}). We will not guess which one counts — please leave one and remove the other. Nothing has been saved.`;
  }
}

/** Per-rij dubbelcheck. Waarschuwingen blokkeren niets; een mens beslist. */
export function waarschuwingsTekst(w: RijWaarschuwing): string {
  switch (w.code) {
    case "must_veld_leeg":
      return `Row ${w.rij}: "${w.labelEn}" is empty. This is a required field.`;
    case "onbekende_artikelcode":
      return `Row ${w.rij}: we do not know article code "${w.artikelcode}" yet — a new product?`;
    case "dubbele_artikelcode":
      return `Row ${w.rij}: article code "${w.artikelcode}" also appears on row ${lijst(w.ookOpRijen.map(String))}.`;
  }
}

/**
 * Samenvatting bovenaan een waarschuwingslijst. Dit is precies waarom de validator codes
 * teruggeeft en geen zinnen: alleen een renderer die de tellingen ziet, kan 400 losse
 * "nieuw product?"-regels samenvatten tot één geruststellende zin. In 4.B ziet een merk
 * anders 400 rode regels en concludeert het dat de upload mislukte.
 */
export function samenvattingsTekst(
  waarschuwingen: RijWaarschuwing[],
  rijen: number,
): string {
  if (waarschuwingen.length === 0) {
    return rijen === 0
      ? "The format is correct, but the file contains no product rows."
      : `The format is correct — ${rijen} product ${rijen === 1 ? "row" : "rows"}, nothing to double-check.`;
  }
  const tel = (code: RijWaarschuwing["code"]) =>
    waarschuwingen.filter((w) => w.code === code).length;
  const nieuw = new Set(
    waarschuwingen.filter((w) => w.code === "onbekende_artikelcode").map((w) => w.rij),
  ).size;
  const delen: string[] = [];
  if (tel("must_veld_leeg") > 0) {
    delen.push(`${tel("must_veld_leeg")} empty required field(s)`);
  }
  if (nieuw > 0) {
    delen.push(
      nieuw === rijen && rijen > 0
        ? `all ${rijen} products are new to us (normal for a first delivery)`
        : `${nieuw} possibly new product(s)`,
    );
  }
  if (tel("dubbele_artikelcode") > 0) {
    delen.push(`${tel("dubbele_artikelcode")} row(s) with a duplicate article code`);
  }
  return `The format is correct — ${rijen} product ${rijen === 1 ? "row" : "rows"}. Please double-check: ${lijst(delen)}.`;
}
