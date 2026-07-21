// Format-validatie van een ingevuld merk-template (sprint 1.1, poortwachter van het
// retour-pad). Spiegelbeeld van lib/excel-template.ts: die bouwt het template, deze leest
// een ingevulde versie terug. Beide leiden "ons format" UITSLUITEND af uit
// lib/field-catalog.ts — nul hardgecodeerde kolomnamen, want het template wijzigt
// (16 jul: NL-velden eruit, 34e1e57). De rondgang-test bewijst dat ze niet uiteenlopen.
//
// PUUR: geen imports uit db/, lib/repo/ of app/. De bekende artikelcodes komen als
// parameter binnen. Dat is geen stijlvoorkeur maar het ontwerpdoel — week 4-uitloop B
// (merkportaal-self-serve) moet deze module ONGEWIJZIGD hergebruiken.
//
// GEEN PROZA. Het resultaat is een discriminated union van codes + getypeerde parameters;
// lib/excel-validate-messages.ts maakt er tekst van. Reden: in 1.2 leest Brink de melding,
// in 4.B leest het MERK hem. Zou de taal hier in zitten, dan is de module de plek waar het
// publiek woont en heeft 4.B een tweede smaak nodig. Nu niet.
//
// GEEN INTERPRETATIE. `velden` is rauwe, getrimde celtekst — geen getallen, geen eenheden,
// geen decimaalteken-normalisatie. Dat is per veld en hoort bij de diff-engine van 1.2.
// Het prijsveld wordt uitsluitend op gevuld/leeg getoetst, nooit als bedrag gelezen
// (IJzeren regel 2: geld beïnvloedt nooit de ranking).
//
// GOOIT NOOIT. Kapotte bytes zijn een validatie-uitkomst, geen exception — anders wordt
// het in 1.2 een generieke "er ging iets mis", precies het tegenovergestelde van
// "afwijzing mét wat er mist".
import ExcelJS from "exceljs";
import {
  excelColumns,
  type CatalogBucket,
  type Compleetheidsniveau,
} from "@/lib/field-catalog";

export const WERKBLAD_NAAM = "Product data";
/** Rij 1 = bucketgroepen, rij 2 = veldlabels, rij 3 = instructies, data vanaf rij 4. */
export const KOPRIJ = 2;
export const EERSTE_DATARIJ = 4;
/** Hoe ver we bij een niet-herkende koprij diagnostisch zoeken naar onze labels. */
const DIAGNOSE_RIJEN = 10;

// ── Invoer ──────────────────────────────────────────────────────────────────

export type ValidatieContext = {
  /**
   * De supplier article codes die we van DÍT merk al kennen, exact zoals in
   * products.supplier_article_code.
   *
   * undefined = "geen context, sla de check over" → geen onbekende_artikelcode-
   *   waarschuwingen én artikelcodesGecontroleerd:false.
   * lege Set  = "dit merk heeft nog geen producten" → élke rij is nieuw.
   * Twee verschillende dingen; beide aanroepers kennen beide situaties, dus het
   * onderscheid hoort in de API en niet in een aanname van de aanroeper.
   */
  knownArticleCodes?: ReadonlySet<string>;
};

// ── Kolommen ────────────────────────────────────────────────────────────────

/** Verwijzing naar één catalog-veld; overal dezelfde vorm. */
export type KolomVerwijzing = {
  /** Catalog-key — de ENIGE identifier waarop aanroepers mogen matchen. Labels wijzigen, keys niet. */
  fieldKey: string;
  /** Het label zoals het in rij 2 hoort te staan; letterlijk toonbaar, want zo ziet het merk het. */
  labelEn: string;
  niveau: Compleetheidsniveau;
};

export type HerkendeKolom = KolomVerwijzing & {
  /** 1-based Excel-kolomnummer waar we hem vonden (bewijs dat naam-herkenning werkte). */
  kolom: number;
};

/** Een kolom in rij 2 die wij niet kennen: genegeerd, maar nooit stilzwijgend. */
export type OnbekendeKolom = {
  kolom: number;
  /** Rauwe koptekst van het merk. Geen 🔒-lek: het merk typte dit zelf. */
  koptekst: string;
};

// ── Uitkomst (a): format-afwijzing ──────────────────────────────────────────

/**
 * Precies ÉÉN reden, geen lijst: de redenen zijn hiërarchisch en sluiten elkaar uit
 * (onleesbaar → geen werkblad → geen koprij → kolommen missen). Je kunt niet op kolommen
 * toetsen in een bestand dat je niet kunt openen. De lijst "wat er mist" zit ín de reden.
 */
export type AfwijzingsReden =
  | { code: "onleesbaar_bestand"; detail: string }
  | { code: "werkblad_ontbreekt"; verwacht: string; gevondenWerkbladen: string[] }
  | {
      code: "koprij_niet_herkend";
      gelezenKoprij: string[];
      /** Stonden onze labels op een ándere rij? Dan zei het merk niet "verkeerd bestand"
       *  maar "rij ingevoegd/verwijderd" — dat is een heel andere boodschap. */
      labelsGevondenOpRij: number | null;
    }
  | { code: "must_kolommen_ontbreken"; ontbrekend: KolomVerwijzing[] }
  | {
      /** Twee kolommen claimen hetzelfde veld. De module gokt niet welke telt: de
       *  verkeerde kiezen schrijft stil verkeerde data weg. */
      code: "dubbele_kolomkop";
      labelEn: string;
      kolommen: number[];
    };

export type FormatAfgewezen = {
  ok: false;
  reden: AfwijzingsReden;
  // Bewust GEEN rijen/waarschuwingen: type-niveau-garantie dat een afgewezen bestand niet
  // half verwerkt kan worden. 1.2 kán er niets mee, ook niet per ongeluk.
};

// ── Uitkomst (b): geldig format + rij-waarschuwingen ────────────────────────

/** `rij` is altijd het LETTERLIJKE Excel-rijnummer (4, 5, …), nooit een index — een mens
 *  springt ermee in Excel naar die regel; dat is het hele punt van "per rij". */
export type RijWaarschuwing =
  | { code: "must_veld_leeg"; rij: number; fieldKey: string; labelEn: string }
  | { code: "onbekende_artikelcode"; rij: number; artikelcode: string }
  | {
      code: "dubbele_artikelcode";
      rij: number;
      artikelcode: string;
      /** Elke rij van de groep krijgt zijn eigen waarschuwing die naar de andere wijst,
       *  zodat een rij-gesleutelde UI nooit een rij stil toont. */
      ookOpRijen: number[];
    };

export type GelezenRij = {
  rij: number;
  /**
   * catalog-key → rauwe, getrimde celtekst. Een key is aanwezig ⇔ de kolom stond in het
   * bestand. Dus `"cri" in velden === false` betekent "kolom ontbrak, stel niets voor",
   * en `velden.cri === ""` betekent "kolom stond er, cel leeg". Zonder dat onderscheid
   * kan 1.2 een ontbrekende kolom aanzien voor "veld leeggemaakt" en voorstellen om
   * bestaande data te wissen.
   */
  velden: Record<string, string>;
};

export type FormatGeldig = {
  ok: true;
  /** De werkbladnaam zoals hij écht in het bestand staat (kan in casing afwijken). */
  werkblad: string;
  kolommen: HerkendeKolom[];
  /** Weggelaten wanna/nice-kolommen: geen fout — onze eigen Instructions-tab nodigt ertoe uit. */
  ontbrekendeOptioneleKolommen: KolomVerwijzing[];
  onbekendeKolommen: OnbekendeKolom[];
  /** Alleen écht ingevulde rijen (ons eigen template levert 200 lege invulrijen mee). */
  rijen: GelezenRij[];
  /** Vlak, stabiel gesorteerd op (rij, code). 1.2 groepeert per rij, 4.B telt voor staging. */
  waarschuwingen: RijWaarschuwing[];
  /**
   * false ⇔ context.knownArticleCodes was undefined. Ziet er afleidbaar uit, is het niet:
   * wie later de 4.B-staging-payload leest heeft de context niet meer, en een check die
   * niet liep ziet er dan identiek uit als een schoon bestand.
   */
  artikelcodesGecontroleerd: boolean;
};

export type ValidatieResultaat = FormatAfgewezen | FormatGeldig;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Labels vergelijkbaar maken. Bewust smal: NFKC + onzichtbare spaties + witruimte +
 * lowercase, en dan EXACT matchen. Geen fuzzy matching, geen synoniemen — een
 * vals-positieve kolommatch schrijft stil de verkeerde data in het verkeerde veld, exact
 * de schade die naam-herkenning nu juist wegneemt. Normalisatie is verliesvrij, fuzzy niet.
 *
 * GEËXPORTEERD sinds 1.8: labelBotsing() in lib/custom-fields.ts moet bij het AANMAKEN van
 * een eigen veld exact dezelfde normalisatie toepassen als deze module bij het HERKENNEN
 * doet. Een tweede kopie zou een botsing opleveren die de aanmaakcheck niet ziet en de
 * validator wél — en die botsing is een harde afwijzing van élk merkbestand.
 */
export function normLabel(tekst: string): string {
  return tekst
    .normalize("NFKC")
    .replace(/[ ​﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Artikelcode voor de vergelijking mét de DB-context: ALLEEN trimmen, niet casefolden.
 * `products_brand_sac_uniq` is een gewone unique index op text en dus hoofdlettergevoelig
 * in Postgres. Zouden we hier casefolden, dan zegt de module "bekend" (geen waarschuwing)
 * terwijl 1.2 exact matcht, "nieuw" concludeert en stil een dubbelproduct aanmaakt. Een
 * valse "nieuw product?" kost een mens twee seconden; een valse "bekend" verbergt schade.
 * Streng zijn in de richting die waarschuwingen produceert, niet in die van stilte.
 */
function codeVoorLookup(tekst: string): string {
  return tekst.trim();
}

/**
 * Artikelcode voor duplicaat-detectie BINNEN het bestand: hier casefolden we wél. De
 * asymmetrie met codeVoorLookup() is opzettelijk en volgt uit welke fout stil is — een
 * gemist duplicaat is stille schade, een extra dubbelcheck is gratis. Niet "harmoniseren".
 */
function codeVoorDedup(tekst: string): string {
  return tekst.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Celwaarde → tekst. exceljs' CellValue is een union van tien vormen; een kale String(v)
 * geeft "[object Object]" op rich text/formule/hyperlink. In de KOPRIJ zou dat een valse
 * format-afwijzing van een prima bestand opleveren — de ergst denkbare bug hier, want dan
 * concludeert Brink dat de module stuk is. Daarom één helper voor kop én data.
 * Bewust niet cell.text: die formatteert getallen via numFmt en datums locale-afhankelijk.
 */
function celTekst(cell: ExcelJS.Cell, diepte = 0): string {
  const V = ExcelJS.ValueType;
  // Slave van een merge: exceljs geeft hem de waarde van de master.
  if (cell.type === V.Merge && diepte < 2 && cell.master && cell.master !== cell) {
    return celTekst(cell.master, diepte + 1);
  }
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("error" in o) return ""; // #N/A e.d. telt als leeg
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((r) => r.text ?? "")
        .join("")
        .trim();
    }
    if ("text" in o && typeof o.text === "string") return o.text.trim(); // hyperlink
    if ("result" in o) {
      const r = o.result as unknown; // formule → uitkomst
      if (r == null) return "";
      if (typeof r === "object" && "error" in (r as object)) return "";
      return String(r).trim();
    }
    if ("hyperlink" in o) return String(o.hyperlink).trim();
  }
  return String(v).trim();
}

function afgewezen(reden: AfwijzingsReden): FormatAfgewezen {
  return { ok: false, reden };
}

/** Vaste rangorde zodat waarschuwingen stabiel sorteren (rij, dan code). */
const CODE_RANG: Record<RijWaarschuwing["code"], number> = {
  must_veld_leeg: 0,
  onbekende_artikelcode: 1,
  dubbele_artikelcode: 2,
};

// ── De module ───────────────────────────────────────────────────────────────

/**
 * @param catalogus de COMPLETE veldcatalogus (vast deel + eigen velden). Verplicht en
 *   vóór `context`: deze module blijft puur, en met een default zou een merkbestand mét
 *   Stefans kolommen die kolommen stil als `onbekendeKolommen` afserveren.
 */
export async function validateFilledTemplateXlsx(
  bytes: Uint8Array | ArrayBuffer,
  catalogus: readonly CatalogBucket[],
  context: ValidatieContext = {},
): Promise<ValidatieResultaat> {
  const kolommen = excelColumns(catalogus);
  // labelEn → catalog-veld, genormaliseerd. Uniciteit is een aanname over field-catalog.ts
  // die deze module draagt; de test dwingt hem af in plaats van te hopen.
  const perLabel = new Map<string, (typeof kolommen)[number]["field"]>();
  for (const { field } of kolommen) perLabel.set(normLabel(field.labelEn), field);

  // 1. Bestand openen. Elke exceljs-fout is hier een uitkomst, geen exception.
  const wb = new ExcelJS.Workbook();
  try {
    const ab =
      bytes instanceof Uint8Array
        ? (bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer)
        : bytes;
    if (ab.byteLength === 0) throw new Error("leeg bestand (0 bytes)");
    await wb.xlsx.load(ab as never);
  } catch (err) {
    return afgewezen({
      code: "onleesbaar_bestand",
      detail: String(err instanceof Error ? err.message : err).slice(0, 200),
    });
  }

  // 2. Werkblad zoeken: exact, dan trim+casefold als terugval. Bewust NIET alle bladen op
  // inhoud aftasten — stil het verkeerde blad kiezen is erger dan een duidelijke afwijzing,
  // en gevondenWerkbladen maakt de afwijzing alsnog oplosbaar.
  const bladNamen: string[] = [];
  wb.eachSheet((sheet) => bladNamen.push(sheet.name));
  const ws =
    wb.getWorksheet(WERKBLAD_NAAM) ??
    wb.worksheets.find((s) => normLabel(s.name) === normLabel(WERKBLAD_NAAM));
  if (!ws) {
    return afgewezen({
      code: "werkblad_ontbreekt",
      verwacht: WERKBLAD_NAAM,
      gevondenWerkbladen: bladNamen,
    });
  }

  // 3. Koprij lezen (rij 2). Merge-slaves tellen als leeg: een gemergde kop is ambigu —
  // welke kolom identificeert hij? — en zou anders een valse dubbele_kolomkop opleveren.
  const laatsteKolom = Math.max(ws.columnCount, kolommen.length);
  const koppen: { kolom: number; tekst: string }[] = [];
  for (let c = 1; c <= laatsteKolom; c++) {
    const cell = ws.getRow(KOPRIJ).getCell(c);
    const tekst = cell.type === ExcelJS.ValueType.Merge ? "" : celTekst(cell);
    if (tekst !== "") koppen.push({ kolom: c, tekst });
  }

  const herkend: HerkendeKolom[] = [];
  const onbekendeKolommen: OnbekendeKolom[] = [];
  const perFieldKey = new Map<string, number[]>();
  for (const { kolom, tekst } of koppen) {
    const field = perLabel.get(normLabel(tekst));
    if (!field) {
      onbekendeKolommen.push({ kolom, koptekst: tekst });
      continue;
    }
    perFieldKey.set(field.key, [...(perFieldKey.get(field.key) ?? []), kolom]);
    herkend.push({
      fieldKey: field.key,
      labelEn: field.labelEn,
      niveau: field.niveau,
      kolom,
    });
  }

  // 4. Herkennen we het bestand überhaupt? Geen enkel label → dit is ons template niet.
  // "Je mist 66 kolommen" zou hier een waslijst én een leugen zijn.
  if (herkend.length === 0) {
    let labelsGevondenOpRij: number | null = null;
    for (let r = 1; r <= DIAGNOSE_RIJEN; r++) {
      if (r === KOPRIJ) continue;
      let treffers = 0;
      for (let c = 1; c <= laatsteKolom; c++) {
        if (perLabel.has(normLabel(celTekst(ws.getRow(r).getCell(c))))) treffers++;
      }
      if (treffers >= 2) {
        labelsGevondenOpRij = r;
        break;
      }
    }
    return afgewezen({
      code: "koprij_niet_herkend",
      gelezenKoprij: koppen.map((k) => k.tekst),
      labelsGevondenOpRij,
    });
  }

  // 5. Dezelfde kop twee keer: ambigu, dus afwijzen. "Eerste wint" zou stil de lege kopie
  // kunnen laten winnen.
  for (const [fieldKey, kols] of perFieldKey) {
    if (kols.length > 1) {
      const field = herkend.find((h) => h.fieldKey === fieldKey)!;
      return afgewezen({
        code: "dubbele_kolomkop",
        labelEn: field.labelEn,
        kolommen: kols,
      });
    }
  }

  // 6. Must-kolommen. Runtime uit de catalog afgeleid — promoveert iemand een CATALOGUSveld
  // naar must, dan verscherpt de validator vanzelf mee (zie HANDOVER: dat is een breaking
  // change voor merkbestanden die onderweg zijn).
  const ontbrekendeMust: KolomVerwijzing[] = [];
  const ontbrekendeOptioneleKolommen: KolomVerwijzing[] = [];
  for (const { field } of kolommen) {
    if (perFieldKey.has(field.key)) continue;
    const ref: KolomVerwijzing = {
      fieldKey: field.key,
      labelEn: field.labelEn,
      niveau: field.niveau,
    };
    // ⚠️ `must` OP EEN EIGEN VELD WIJST NOOIT EEN BESTAND AF (sprint 1.8, plan §2). "must"
    // heeft daardoor twee licht verschillende betekenissen, en dat is opzet.
    //
    // De harde afwijzing bestaat omdat catalogus-musts DRAGEND ZIJN VOOR DE VERWERKING
    // zelf: zonder supplier_article_code is er geen sleutel om een rij aan een product te
    // koppelen — dedup en de bekende-codes-check hangen eraan (zie de toelichting onder
    // deze lus). Een veld dat Stefan vandaag aanmaakt kan per definitie nooit dragend zijn
    // voor de verwerking; de verwerking kende het gisteren nog niet.
    //
    // Zou het tóch afwijzen, dan maakt één klik élk merkbestand dat al onderweg is
    // onbruikbaar: bestanden die verstuurd zijn vóórdat het veld bestond, die geen enkel
    // merk had kúnnen invullen. Een ontbrekend eigen must-veld gaat dus naar
    // ontbrekendeOptioneleKolommen; `must` werkt op een eigen veld uitsluitend door in de
    // weging van de scorecard en in de must_veld_leeg-waarschuwing hieronder — en die
    // vraagt om een kolom die er wél is.
    //
    // Herkend aan measure.kind, niet aan de key-prefix: dat is de discriminant die de
    // compiler ziet, en het houdt deze module vrij van een import uit lib/custom-fields.ts
    // (die importeert normLabel hiervandaan — andersom zou een cyclus zijn).
    const eigenVeld = field.measure.kind === "custom";
    if (field.niveau === "must" && !eigenVeld) ontbrekendeMust.push(ref);
    else ontbrekendeOptioneleKolommen.push(ref);
  }
  // Ontbrekende must-KOLOM = afwijzing, lege must-CEL = waarschuwing. Die asymmetrie oogt
  // inconsistent maar is het niet: een ontbrekende kolom betekent dat het merk het veld
  // nooit gezien heeft, een lege cel dat het merk hem zag en niets had. Zonder
  // Supplier article code is (b) bovendien onmogelijk — dedup en de bekende-codes-check
  // hangen eraan, en 1.2 heeft geen sleutel om een rij aan iets te koppelen.
  if (ontbrekendeMust.length > 0) {
    return afgewezen({ code: "must_kolommen_ontbreken", ontbrekend: ontbrekendeMust });
  }

  // 7. Datarijen. "Datarij" is inhoudelijk gedefinieerd — een rij waarin minstens één
  // herkende kolom niet-leeg is. Dat lost in één regel de 200 cosmetische invulrijen uit
  // onze eigen builder, lege tussenrijen en alleen-opmaak-rijen op. Bewust niet "stop bij
  // de eerste lege rij": dat verliest alles ná een gat.
  const mustKolommen = herkend.filter((h) => h.niveau === "must");
  const codeKolom = herkend.find((h) => h.fieldKey === "supplier_article_code")!;

  const rijen: GelezenRij[] = [];
  const waarschuwingen: RijWaarschuwing[] = [];
  const rijenPerCode = new Map<string, number[]>();

  ws.eachRow({ includeEmpty: false }, (row) => {
    if (row.number < EERSTE_DATARIJ) return;
    const velden: Record<string, string> = {};
    let gevuld = false;
    for (const h of herkend) {
      const tekst = celTekst(row.getCell(h.kolom));
      velden[h.fieldKey] = tekst;
      if (tekst !== "") gevuld = true;
    }
    if (!gevuld) return;
    rijen.push({ rij: row.number, velden });

    for (const h of mustKolommen) {
      if (velden[h.fieldKey] === "") {
        waarschuwingen.push({
          code: "must_veld_leeg",
          rij: row.number,
          fieldKey: h.fieldKey,
          labelEn: h.labelEn,
        });
      }
    }

    const rauweCode = velden[codeKolom.fieldKey];
    // Lege code: al gemeld als must_veld_leeg. Hem meenemen in dedup zou tien half-lege
    // rijen tot "10× dezelfde code" maken — een waarschuwing over leegte die de
    // leegte-waarschuwing verdringt.
    if (rauweCode !== "") {
      const dedup = codeVoorDedup(rauweCode);
      rijenPerCode.set(dedup, [...(rijenPerCode.get(dedup) ?? []), row.number]);
    }
  });

  // 8. Onbekende artikelcodes ("nieuw product?" — een dubbelcheck, uitdrukkelijk geen fout).
  const artikelcodesGecontroleerd = context.knownArticleCodes !== undefined;
  if (context.knownArticleCodes) {
    const bekend = new Set([...context.knownArticleCodes].map(codeVoorLookup));
    for (const rij of rijen) {
      const code = rij.velden[codeKolom.fieldKey];
      if (code !== "" && !bekend.has(codeVoorLookup(code))) {
        waarschuwingen.push({
          code: "onbekende_artikelcode",
          rij: rij.rij,
          artikelcode: code,
        });
      }
    }
  }

  // 9. Duplicaten binnen het bestand: elke betrokken rij krijgt zijn eigen waarschuwing
  // die naar de andere wijst. "De eerste is onschuldig" is een willekeurige asymmetrie —
  // in een scherm wil je bij beide rijen de badge zien.
  for (const [, rijNummers] of rijenPerCode) {
    if (rijNummers.length < 2) continue;
    for (const nr of rijNummers) {
      waarschuwingen.push({
        code: "dubbele_artikelcode",
        rij: nr,
        artikelcode: rijen.find((r) => r.rij === nr)!.velden[codeKolom.fieldKey],
        ookOpRijen: rijNummers.filter((x) => x !== nr),
      });
    }
  }

  waarschuwingen.sort(
    (a, b) => a.rij - b.rij || CODE_RANG[a.code] - CODE_RANG[b.code],
  );

  return {
    ok: true,
    werkblad: ws.name,
    kolommen: herkend,
    ontbrekendeOptioneleKolommen,
    onbekendeKolommen,
    rijen,
    waarschuwingen,
    artikelcodesGecontroleerd,
  };
}
