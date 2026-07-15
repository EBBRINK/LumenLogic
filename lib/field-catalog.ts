// Field-catalog (plan-merkrelaties K4): ÉÉN bron van waarheid voor de compleetheids-
// scorecard, het merk-Excel-template en het "wat missen we"-bericht.
//
// Begrippen (fase-2-besluit): "tier" blijft gereserveerd voor disclosure_tier (toestemming);
// de compleetheids-as heet hier "compleetheidsniveau" (must/wanna/nice) en de veldgroepen
// heten "buckets".
//
// Tweetalig: labelNl/instructie zijn voor de interne UI (scorecard, bericht); labelEn/
// instructionEn zijn voor het merk-Excel-template dat naar (internationale) merken gaat.
// Engelse instructies gebruiken de punt als decimaalteken (12.5 i.p.v. 12,5).
//
// Meetbaarheid (v1): een veld telt alleen mee in de scorecard als het een bestaande
// products-kolom heeft (measure.kind "column") of via de prijstabel meetbaar is
// (kind "price" — een EXISTS op prices bij een GELDIGE prijslijst; het bedrag zelf wordt
// nooit gebruikt, ijzeren regel 2). Alles zonder kolom is kind "none" = grijs
// "nog niet meetbaar"; zodra het datamodel-onderdeel de kolom toevoegt is het invullen
// van measure.column hier voldoende om het veld mee te laten tellen.
//
// 🔒-velden (internalOnly): nooit in het merk-Excel, nooit extern.

export type Compleetheidsniveau = "must" | "wanna" | "nice";

export type FieldMeasure =
  | { kind: "column"; column: string } // bestaande products-kolom (db/schema.ts)
  | { kind: "price" } // EXISTS op prices mét geldige prijslijst (nooit het bedrag)
  | { kind: "none" }; // nog niet meetbaar (grijs in de scorecard)

export type CatalogField = {
  key: string;
  labelNl: string;
  labelEn: string; // Engels veldlabel — het merk-Excel is volledig Engelstalig
  niveau: Compleetheidsniveau;
  matcher: boolean; // ⚙️ de match-engine gebruikt dit veld
  internalOnly: boolean; // 🔒 intern/commercieel — nooit naar het merk
  inExcel: boolean; // 📄 hoort in het merk-Excel (merk levert aan)
  instructie: string; // korte NL invul-instructie (eenheid/formaat/voorbeeld)
  instructionEn: string; // Engelse invul-instructie (zelfde inhoud, punt als decimaalteken)
  measure: FieldMeasure;
};

export type CatalogBucket = {
  key: string;
  labelNl: string;
  labelEn: string;
  order: number;
  fields: CatalogField[];
};

// "Geen reactie" is geen status maar een filter (K1): merken met een uitstaande
// benadering waarvan het laatste contact langer dan dit aantal dagen geleden is.
export const GEEN_REACTIE_DAGEN = 14;

// Interne 🔒-velden delen dezelfde vlaggen; kleine helper houdt de tabel leesbaar.
const intern = { matcher: false, internalOnly: true, inExcel: false } as const;
const extern = { matcher: false, internalOnly: false, inExcel: true } as const;
const col = (column: string): FieldMeasure => ({ kind: "column", column });
const NONE: FieldMeasure = { kind: "none" };

export const FIELD_CATALOG: CatalogBucket[] = [
  {
    key: "basis_identiteit",
    labelNl: "Basis & identiteit",
    labelEn: "Basics & identity",
    order: 1,
    fields: [
      { key: "supplier_article_code", labelNl: "Artikelnummer leverancier", labelEn: "Supplier article code", niveau: "must", ...extern, instructie: "Uw eigen artikelnummer, exact zoals op de prijslijst, bv. 123-456-78.", instructionEn: "Your own article number, exactly as on the price list, e.g. 123-456-78.", measure: col("supplier_article_code") },
      { key: "ean_code", labelNl: "EAN-code", labelEn: "EAN code", niveau: "nice", ...extern, instructie: "EAN-13, 13 cijfers, bv. 8712345678906.", instructionEn: "EAN-13, 13 digits, e.g. 8712345678906.", measure: NONE },
      { key: "name_nl", labelNl: "Productnaam (NL)", labelEn: "Product name (Dutch)", niveau: "must", ...extern, instructie: "Nederlandse productnaam, bv. 'Downlight Vega 15W 3000K'.", instructionEn: "Dutch product name, e.g. 'Downlight Vega 15W 3000K'.", measure: col("name") },
      { key: "name_en", labelNl: "Productnaam (EN)", labelEn: "Product name (English)", niveau: "must", ...extern, instructie: "Engelse productnaam, bv. 'Downlight Vega 15W 3000K'.", instructionEn: "English product name, e.g. 'Downlight Vega 15W 3000K'.", measure: NONE },
      { key: "description_nl", labelNl: "Omschrijving (NL)", labelEn: "Description (Dutch)", niveau: "wanna", ...extern, instructie: "Korte Nederlandse omschrijving, 1–3 zinnen.", instructionEn: "Short Dutch description, 1–3 sentences.", measure: col("description") },
      { key: "description_en", labelNl: "Omschrijving (EN)", labelEn: "Description (English)", niveau: "wanna", ...extern, instructie: "Korte Engelse omschrijving, 1–3 zinnen.", instructionEn: "Short English description, 1–3 sentences.", measure: NONE },
      { key: "family", labelNl: "Productfamilie", labelEn: "Product family", niveau: "nice", ...extern, instructie: "Serie-/familienaam, bv. 'Vega'.", instructionEn: "Series or family name, e.g. 'Vega'.", measure: NONE },
      { key: "designer", labelNl: "Ontwerper", labelEn: "Designer", niveau: "nice", ...extern, instructie: "Naam van de ontwerper, indien van toepassing.", instructionEn: "Name of the designer, if applicable.", measure: NONE },
      { key: "category", labelNl: "Categorie", labelEn: "Category", niveau: "must", ...extern, instructie: "Categoriepad, bv. 'Binnenverlichting > Downlights'.", instructionEn: "Category path, e.g. 'Indoor lighting > Downlights'.", measure: col("category_path") },
      { key: "etim_class", labelNl: "ETIM-klasse", labelEn: "ETIM class", niveau: "wanna", ...extern, instructie: "ETIM-klassecode, bv. EC001744.", instructionEn: "ETIM class code, e.g. EC001744.", measure: NONE },
    ],
  },
  {
    key: "commercie",
    labelNl: "Commercie",
    labelEn: "Commercial",
    order: 2,
    fields: [
      // Meetbaar via de prijstabel: bestaat er een prijs op een GELDIGE lijst? Het bedrag
      // wordt nooit gelezen (regel 2) en "prijs ✓" kan niet naast "lijst verlopen" staan.
      { key: "list_price_excl_vat", labelNl: "Brutoprijs excl. btw", labelEn: "Gross list price excl. VAT", niveau: "must", ...extern, instructie: "Bruto adviesprijs excl. btw in euro, bv. 129,50.", instructionEn: "Gross recommended price excl. VAT in euros, e.g. 129.50.", measure: { kind: "price" } },
      { key: "purchase_price_excl_vat", labelNl: "Inkoopprijs excl. btw", labelEn: "Purchase price excl. VAT", niveau: "wanna", ...intern, instructie: "Intern-commercieel — nooit in het merk-Excel.", instructionEn: "Internal commercial — never in the brand Excel.", measure: NONE },
      { key: "brand_discount", labelNl: "Merk-korting", labelEn: "Brand discount", niveau: "wanna", ...intern, instructie: "Intern-commercieel — nooit in het merk-Excel.", instructionEn: "Internal commercial — never in the brand Excel.", measure: NONE },
      { key: "stock", labelNl: "Voorraad", labelEn: "Stock", niveau: "nice", ...intern, instructie: "Intern — nooit in het merk-Excel.", instructionEn: "Internal — never in the brand Excel.", measure: NONE },
      { key: "stock_reserved", labelNl: "Voorraad gereserveerd", labelEn: "Stock reserved", niveau: "nice", ...intern, instructie: "Intern — nooit in het merk-Excel.", instructionEn: "Internal — never in the brand Excel.", measure: NONE },
      { key: "show_on_web", labelNl: "Tonen op web", labelEn: "Show on web", niveau: "nice", ...intern, instructie: "Interne webvlag — nooit in het merk-Excel.", instructionEn: "Internal web flag — never in the brand Excel.", measure: NONE },
      { key: "show_price_on_web", labelNl: "Prijs tonen op web", labelEn: "Show price on web", niveau: "nice", ...intern, instructie: "Interne webvlag — nooit in het merk-Excel.", instructionEn: "Internal web flag — never in the brand Excel.", measure: NONE },
    ],
  },
  {
    key: "afmetingen",
    labelNl: "Afmetingen",
    labelEn: "Dimensions",
    order: 3,
    fields: [
      { key: "height_cm", labelNl: "Hoogte (cm)", labelEn: "Height (cm)", niveau: "wanna", ...extern, matcher: true, instructie: "Hoogte in centimeters, bv. 12,5.", instructionEn: "Height in centimeters, e.g. 12.5.", measure: col("height_cm") },
      { key: "width_cm", labelNl: "Breedte (cm)", labelEn: "Width (cm)", niveau: "wanna", ...extern, matcher: true, instructie: "Breedte in centimeters, bv. 20.", instructionEn: "Width in centimeters, e.g. 20.", measure: col("width_cm") },
      { key: "length_cm", labelNl: "Lengte (cm)", labelEn: "Length (cm)", niveau: "wanna", ...extern, matcher: true, instructie: "Lengte in centimeters, bv. 120.", instructionEn: "Length in centimeters, e.g. 120.", measure: col("length_cm") },
      { key: "diameter_cm", labelNl: "Diameter (cm)", labelEn: "Diameter (cm)", niveau: "wanna", ...extern, matcher: true, instructie: "Diameter in centimeters, bv. 8,5.", instructionEn: "Diameter in centimeters, e.g. 8.5.", measure: col("diameter_cm") },
      { key: "cutting_size_height_cm", labelNl: "Zaagmaat hoogte (cm)", labelEn: "Cut-out height (cm)", niveau: "nice", ...extern, instructie: "Inbouw-zaagmaat hoogte in centimeters.", instructionEn: "Recessed cut-out height in centimeters.", measure: NONE },
      { key: "cutting_size_width_cm", labelNl: "Zaagmaat breedte (cm)", labelEn: "Cut-out width (cm)", niveau: "nice", ...extern, instructie: "Inbouw-zaagmaat breedte in centimeters.", instructionEn: "Recessed cut-out width in centimeters.", measure: NONE },
      { key: "cutting_size_length_cm", labelNl: "Zaagmaat lengte (cm)", labelEn: "Cut-out length (cm)", niveau: "nice", ...extern, instructie: "Inbouw-zaagmaat lengte in centimeters.", instructionEn: "Recessed cut-out length in centimeters.", measure: NONE },
      { key: "cutting_size_diameter_cm", labelNl: "Zaagmaat diameter (cm)", labelEn: "Cut-out diameter (cm)", niveau: "nice", ...extern, instructie: "Inbouw-zaagmaat diameter in centimeters, bv. 6,8.", instructionEn: "Recessed cut-out diameter in centimeters, e.g. 6.8.", measure: NONE },
    ],
  },
  {
    key: "uiterlijk",
    labelNl: "Uiterlijk",
    labelEn: "Appearance",
    order: 4,
    fields: [
      { key: "color_1", labelNl: "Kleur (primair)", labelEn: "Color 1", niveau: "wanna", ...extern, matcher: true, instructie: "Hoofdkleur, bv. 'wit' of 'RAL 9005'.", instructionEn: "Main color, e.g. 'white' or 'RAL 9005'.", measure: col("color_1") },
      { key: "material_1", labelNl: "Materiaal (primair)", labelEn: "Material 1", niveau: "wanna", ...extern, matcher: true, instructie: "Hoofdmateriaal, bv. 'aluminium'.", instructionEn: "Main material, e.g. 'aluminium'.", measure: col("material_1") },
      { key: "color_2", labelNl: "Kleur (secundair)", labelEn: "Color 2", niveau: "nice", ...extern, instructie: "Tweede kleur, indien van toepassing.", instructionEn: "Secondary color, if applicable.", measure: NONE },
      { key: "material_2", labelNl: "Materiaal (secundair)", labelEn: "Material 2", niveau: "nice", ...extern, instructie: "Tweede materiaal, indien van toepassing.", instructionEn: "Secondary material, if applicable.", measure: NONE },
    ],
  },
  {
    key: "lichtbron_fitting",
    labelNl: "Lichtbron & fitting",
    labelEn: "Light source & fitting",
    order: 5,
    fields: [
      { key: "light_source", labelNl: "Lichtbron", labelEn: "Light source", niveau: "wanna", ...extern, matcher: true, instructie: "Type lichtbron, bv. 'LED geïntegreerd' of 'GU10'.", instructionEn: "Type of light source, e.g. 'integrated LED' or 'GU10'.", measure: col("light_source") },
      { key: "light_source_system", labelNl: "Lichtbronsysteem", labelEn: "Light source system", niveau: "wanna", ...extern, instructie: "Modulesysteem, bv. 'Fortimo'.", instructionEn: "Module system, e.g. 'Fortimo'.", measure: NONE },
      { key: "light_source_included", labelNl: "Lichtbron meegeleverd", labelEn: "Light source included", niveau: "wanna", ...extern, instructie: "Ja of nee.", instructionEn: "Yes or no.", measure: NONE },
      { key: "lamp_foot", labelNl: "Fitting", labelEn: "Fitting", niveau: "wanna", ...extern, instructie: "Lampvoet, bv. E27, GU10, G9.", instructionEn: "Fitting, e.g. E27, GU10, G9.", measure: NONE },
      { key: "lamp_category", labelNl: "Lampcategorie", labelEn: "Lamp category", niveau: "wanna", ...extern, instructie: "Categorie van de lichtbron, bv. 'LED-module'.", instructionEn: "Category of the light source, e.g. 'LED module'.", measure: NONE },
      { key: "max_wattage", labelNl: "Max. wattage", labelEn: "Max wattage", niveau: "wanna", ...extern, matcher: true, instructie: "Maximaal vermogen in watt, bv. 15.", instructionEn: "Maximum power in watts, e.g. 15.", measure: col("max_wattage") },
    ],
  },
  {
    key: "fotometrie",
    labelNl: "Fotometrie",
    labelEn: "Photometrics",
    order: 6,
    fields: [
      { key: "kelvin", labelNl: "Kleurtemperatuur (K)", labelEn: "Color temperature (K)", niveau: "wanna", ...extern, matcher: true, instructie: "Kleurtemperatuur in kelvin, bv. 3000.", instructionEn: "Color temperature in kelvin, e.g. 3000.", measure: col("kelvin") },
      { key: "lumen_output", labelNl: "Lichtstroom (lm)", labelEn: "Lumen output (lm)", niveau: "wanna", ...extern, matcher: true, instructie: "Lichtstroom in lumen, bv. 1100.", instructionEn: "Luminous flux in lumens, e.g. 1100.", measure: col("lumen_output") },
      { key: "cri", labelNl: "CRI", labelEn: "CRI", niveau: "wanna", ...extern, matcher: true, instructie: "Kleurweergave-index, bv. 90.", instructionEn: "Color rendering index, e.g. 90.", measure: col("cri") },
      { key: "beam_angle", labelNl: "Stralingshoek (°)", labelEn: "Beam Angle (°)", niveau: "wanna", ...extern, matcher: true, instructie: "Stralingshoek in graden, bv. 36.", instructionEn: "Beam angle in degrees, e.g. 36.", measure: col("beam_angle") },
      { key: "sdcm", labelNl: "SDCM", labelEn: "SDCM", niveau: "wanna", ...extern, instructie: "Kleurconsistentie in SDCM/MacAdam, bv. 3.", instructionEn: "Color consistency in SDCM/MacAdam steps, e.g. 3.", measure: NONE },
      { key: "efficacy", labelNl: "Efficiëntie (lm/W)", labelEn: "Efficacy (lm/W)", niveau: "wanna", ...extern, instructie: "Lichtrendement in lumen per watt, bv. 110.", instructionEn: "Luminous efficacy in lumens per watt, e.g. 110.", measure: NONE },
      { key: "ugr", labelNl: "UGR", labelEn: "UGR", niveau: "wanna", ...extern, instructie: "Verblindingswaarde, bv. '<19'.", instructionEn: "Unified glare rating, e.g. '<19'.", measure: NONE },
      { key: "lifetime_rating", labelNl: "Levensduurklasse", labelEn: "Lifetime rating", niveau: "wanna", ...extern, instructie: "Bv. 'L80B10 @ 50.000 uur'.", instructionEn: "E.g. 'L80B10 @ 50,000 hours'.", measure: NONE },
      { key: "system_lumen", labelNl: "Systeemlumen", labelEn: "System lumen output", niveau: "nice", ...extern, instructie: "Lichtstroom van het armatuur ná optiek, in lumen.", instructionEn: "Luminous flux of the luminaire after optics, in lumens.", measure: NONE },
      { key: "module_lumen", labelNl: "Modulelumen", labelEn: "Module lumen output", niveau: "nice", ...extern, instructie: "Lichtstroom van de LED-module (bron), in lumen.", instructionEn: "Luminous flux of the LED module (source), in lumens.", measure: NONE },
      { key: "light_distribution", labelNl: "Lichtverdeling", labelEn: "Light distribution", niveau: "nice", ...extern, instructie: "Bv. 'direct', 'indirect' of 'direct/indirect'.", instructionEn: "E.g. 'direct', 'indirect' or 'direct/indirect'.", measure: NONE },
    ],
  },
  {
    key: "elektrisch_driver",
    labelNl: "Elektrisch / driver",
    labelEn: "Electrical / driver",
    order: 7,
    fields: [
      { key: "dimmable", labelNl: "Dimbaar", labelEn: "Dimmable", niveau: "wanna", ...extern, matcher: true, instructie: "Dimbaar ja/nee, bv. 'ja' of 'niet dimbaar'.", instructionEn: "Dimmable yes/no, e.g. 'yes' or 'not dimmable'.", measure: col("dimmable") },
      { key: "dim_protocol", labelNl: "Dimprotocol", labelEn: "Dimming protocol", niveau: "wanna", ...extern, instructie: "Bv. DALI, DALI-2, 1-10V, fase-afsnijding, Casambi.", instructionEn: "E.g. DALI, DALI-2, 1-10V, trailing edge, Casambi.", measure: NONE },
      { key: "driver_included", labelNl: "Driver meegeleverd", labelEn: "Driver included", niveau: "wanna", ...extern, instructie: "Ja of nee.", instructionEn: "Yes or no.", measure: col("driver_included") },
      { key: "system_wattage", labelNl: "Systeemwattage (W)", labelEn: "System wattage (W)", niveau: "wanna", ...extern, instructie: "Totaal opgenomen vermogen in watt, bv. 17,5.", instructionEn: "Total power consumption in watts, e.g. 17.5.", measure: NONE },
      { key: "led_wattage", labelNl: "LED-wattage (W)", labelEn: "LED wattage (W)", niveau: "wanna", ...extern, instructie: "Vermogen van de LED zelf in watt, bv. 15.", instructionEn: "Power of the LED itself in watts, e.g. 15.", measure: NONE },
      { key: "drive_current", labelNl: "Stroomsterkte", labelEn: "Drive current", niveau: "wanna", ...extern, instructie: "Bv. 350mA of 700mA.", instructionEn: "E.g. 350mA or 700mA.", measure: NONE },
      { key: "forward_voltage", labelNl: "Voorwaartse spanning (V)", labelEn: "Forward voltage (V)", niveau: "wanna", ...extern, instructie: "In volt, bv. 34,5.", instructionEn: "In volts, e.g. 34.5.", measure: NONE },
      { key: "nominal_voltage", labelNl: "Nominale spanning", labelEn: "Nominal voltage", niveau: "wanna", ...extern, instructie: "Bv. '230V AC' of '24V DC'.", instructionEn: "E.g. '230V AC' or '24V DC'.", measure: NONE },
      { key: "driver_type", labelNl: "Drivertype", labelEn: "Driver type", niveau: "wanna", ...extern, instructie: "Bv. 'constante stroom' of 'constante spanning'.", instructionEn: "E.g. 'constant current' or 'constant voltage'.", measure: NONE },
      { key: "power_factor", labelNl: "Powerfactor", labelEn: "Power factor", niveau: "nice", ...extern, instructie: "Bv. 0,95.", instructionEn: "E.g. 0.95.", measure: NONE },
      { key: "standby_power", labelNl: "Standby-verbruik (W)", labelEn: "Standby power (W)", niveau: "nice", ...extern, instructie: "In watt, bv. 0,3.", instructionEn: "In watts, e.g. 0.3.", measure: NONE },
    ],
  },
  {
    key: "bescherming_conformiteit",
    labelNl: "Bescherming & conformiteit",
    labelEn: "Protection & compliance",
    order: 8,
    fields: [
      { key: "ip_value", labelNl: "IP-waarde", labelEn: "IP value", niveau: "wanna", ...extern, matcher: true, instructie: "Beschermingsgraad, bv. IP44 of IP65.", instructionEn: "Ingress protection rating, e.g. IP44 or IP65.", measure: col("ip_value") },
      { key: "directionable", labelNl: "Richtbaar", labelEn: "Adjustable", niveau: "wanna", ...extern, instructie: "Ja of nee.", instructionEn: "Yes or no.", measure: col("directionable") },
      { key: "protection_class", labelNl: "Beschermingsklasse", labelEn: "Protection class", niveau: "wanna", ...extern, instructie: "Elektrische klasse I, II of III.", instructionEn: "Electrical class I, II or III.", measure: NONE },
      { key: "ik_rating", labelNl: "IK-waarde", labelEn: "IK rating", niveau: "wanna", ...extern, instructie: "Slagvastheid, bv. IK08.", instructionEn: "Impact resistance, e.g. IK08.", measure: NONE },
      { key: "energy_label", labelNl: "Energielabel", labelEn: "Energy label", niveau: "wanna", ...extern, instructie: "EU-energielabel, bv. 'D'.", instructionEn: "EU energy label, e.g. 'D'.", measure: NONE },
      { key: "emergency", labelNl: "Noodverlichting", labelEn: "Emergency lighting", niveau: "nice", ...extern, instructie: "Ja of nee.", instructionEn: "Yes or no.", measure: NONE },
      { key: "ambient_temp", labelNl: "Omgevingstemperatuur", labelEn: "Ambient temperature", niveau: "nice", ...extern, instructie: "Bereik, bv. '-20 tot +40 °C'.", instructionEn: "Range, e.g. '-20 to +40 °C'.", measure: NONE },
      { key: "flammable_mount", labelNl: "F-markering", labelEn: "F-mark", niveau: "nice", ...extern, instructie: "Geschikt voor montage op brandbaar oppervlak, ja/nee.", instructionEn: "Suitable for mounting on flammable surfaces, yes/no.", measure: NONE },
    ],
  },
  {
    // Bucket 9 is in v1 volledig "nog niet meetbaar" (geen url-kolommen op products).
    key: "documentatie_links",
    labelNl: "Documentatie / links",
    labelEn: "Documentation / links",
    order: 9,
    fields: [
      { key: "url_datasheet", labelNl: "Datasheet-URL", labelEn: "Datasheet URL", niveau: "wanna", ...extern, instructie: "Directe link (https://…) naar de datasheet-PDF.", instructionEn: "Direct link (https://…) to the datasheet PDF.", measure: NONE },
      { key: "url_supplier_page", labelNl: "Productpagina-URL", labelEn: "Product page URL", niveau: "wanna", ...extern, instructie: "Link naar de productpagina op uw website.", instructionEn: "Link to the product page on your website.", measure: NONE },
      { key: "url_install_manual", labelNl: "Installatiehandleiding-URL", labelEn: "Installation manual URL", niveau: "wanna", ...extern, instructie: "Link naar de installatiehandleiding (PDF).", instructionEn: "Link to the installation manual (PDF).", measure: NONE },
      { key: "url_photometry", labelNl: "Fotometrie-URL (IES/LDT)", labelEn: "Photometry URL (IES/LDT)", niveau: "nice", ...extern, instructie: "Link naar het IES- of LDT-bestand.", instructionEn: "Link to the IES or LDT file.", measure: NONE },
      { key: "url_declaration", labelNl: "Conformiteits-URL (CE/DoC)", labelEn: "Conformity URL (CE/DoC)", niveau: "nice", ...extern, instructie: "Link naar de CE-verklaring / Declaration of Conformity.", instructionEn: "Link to the CE declaration / Declaration of Conformity.", measure: NONE },
    ],
  },
  {
    key: "duurzaamheid_milieu",
    labelNl: "Duurzaamheid / milieu",
    labelEn: "Sustainability / environment",
    order: 10,
    fields: [
      { key: "warranty_months", labelNl: "Garantie (maanden)", labelEn: "Warranty (months)", niveau: "wanna", ...extern, instructie: "Garantietermijn in maanden, bv. 60.", instructionEn: "Warranty period in months, e.g. 60.", measure: col("warranty_months") },
      { key: "repairability", labelNl: "Repareerbaarheid", labelEn: "Repairability", niveau: "wanna", ...extern, instructie: "Bv. 'LED-module en driver vervangbaar'.", instructionEn: "E.g. 'LED module and driver replaceable'.", measure: col("repairability") },
      { key: "epd_lifetime_hours", labelNl: "EPD-levensduur (uren)", labelEn: "EPD lifetime (hours)", niveau: "wanna", ...extern, instructie: "Levensduur uit de EPD in branduren, bv. 50000.", instructionEn: "Lifetime from the EPD in burning hours, e.g. 50000.", measure: col("epd_lifetime_hours") },
      { key: "country_of_origin", labelNl: "Land van herkomst", labelEn: "Country of origin", niveau: "wanna", ...extern, instructie: "Productieland, bv. 'Nederland' of ISO-code 'NL'.", instructionEn: "Country of manufacture, e.g. 'Netherlands' or ISO code 'NL'.", measure: col("country_of_origin") },
    ],
  },
];

// ── Afgeleiden (pure functies) ───────────────────────────────────────────────

// Alle 📄-velden in bucket-volgorde — de kolommen van het merk-Excel-template.
// Filtert dubbel (inExcel én !internalOnly) zodat een 🔒-veld er nooit doorheen glipt.
export function excelColumns(): { bucket: CatalogBucket; field: CatalogField }[] {
  return [...FIELD_CATALOG]
    .sort((a, b) => a.order - b.order)
    .flatMap((bucket) =>
      bucket.fields
        .filter((f) => f.inExcel && !f.internalOnly)
        .map((field) => ({ bucket, field })),
    );
}

// Alle velden die v1 kan meten via een bestaande products-kolom (kind "column").
// De prijs-meting (kind "price") loopt apart via de prices-tabel.
export function measurableFields(): { bucket: CatalogBucket; field: CatalogField }[] {
  return [...FIELD_CATALOG]
    .sort((a, b) => a.order - b.order)
    .flatMap((bucket) =>
      bucket.fields
        .filter((f) => f.measure.kind === "column")
        .map((field) => ({ bucket, field })),
    );
}

export type NiveauScore = {
  filled: number; // aantal meetbare velden op dit niveau dat bij ÁLLE producten gevuld is
  total: number; // aantal meetbare velden op dit niveau
  ratio: number; // gemiddelde dekking (0..1) over de meetbare velden van dit niveau
};

export type BucketScore = {
  must: NiveauScore;
  wanna: NiveauScore;
  nice: NiveauScore;
  measurableTotal: number; // meetbare velden in de bucket (column + price)
  unmeasurable: number; // grijze velden (kind "none")
};

// Exacte dekking per compleetheidsniveau (Timo-besluit 1: GEEN 90%-drempel).
// De UI kleurt op een gradient; must.ratio === 1 betekent "donkergroen".
// `filledByField` = per veld-key het aantal producten waar het veld gevuld is;
// `productCount` = totaal aantal producten van het merk. 0 producten → ratio 0.
export function bucketScore(
  bucket: CatalogBucket,
  filledByField: Record<string, number>,
  productCount: number,
): BucketScore {
  const measurable = bucket.fields.filter((f) => f.measure.kind !== "none");
  const perNiveau = (niveau: Compleetheidsniveau): NiveauScore => {
    const fields = measurable.filter((f) => f.niveau === niveau);
    const total = fields.length;
    if (total === 0) return { filled: 0, total: 0, ratio: 0 };
    let filled = 0;
    let coverageSum = 0;
    for (const f of fields) {
      const n = Math.min(filledByField[f.key] ?? 0, productCount);
      const coverage = productCount > 0 ? n / productCount : 0;
      coverageSum += coverage;
      if (productCount > 0 && n === productCount) filled++;
    }
    return { filled, total, ratio: coverageSum / total };
  };
  return {
    must: perNiveau("must"),
    wanna: perNiveau("wanna"),
    nice: perNiveau("nice"),
    measurableTotal: measurable.length,
    unmeasurable: bucket.fields.length - measurable.length,
  };
}
