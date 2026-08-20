// Gedeelde vormtypes voor de presentational componenten. Bewust losgekoppeld van de
// repo zodat de componenten met fixtures getest kunnen worden (screenshots).
import type { Prijstoestand } from "@/lib/prijstoestand";
import type { MatchStatus, StatusCounts } from "./status";

export type { MatchStatus, StatusCounts } from "./status";
export type Phase = "tender" | "awarded";

// B6: commerciële status + XIS-fase (bewust als losse unions, niet uit db/schema —
// de presentational componenten blijven fixture-testbaar zonder repo).
export type ProjectStatus =
  | "concept"
  | "estimate_gestuurd"
  | "offerte"
  | "gegund"
  | "niet_gegund"
  | "archief";

export type XisPhase =
  | "start"
  | "engineering"
  | "calculations"
  | "presenting"
  | "tender"
  | "deal_making"
  | "deliver"
  | "aftersales"
  | "win"
  | "lost";

export type DossierSummary = {
  id: string;
  name: string;
  customer: string | null;
  phase: Phase;
  status: ProjectStatus;
  counts?: StatusCounts;
  lineCount?: number;
};

// Eén afwijking (transparantieregel C-07): oordeel per veld uit de tolerantietabel.
export type Deviation = {
  field: string;
  requested: string | number;
  delivered: string | number | null;
  verdict: "groen" | "geel" | "rood" | "onbekend";
  note?: string;
};

export type SpecLineRow = {
  id: string;
  fixtureCode: string;
  quantity: number | null;
  zone?: string | null;
  brandText: string | null;
  productText: string | null;
  reqKelvin: number | null;
  reqCri: number | null;
  reqIp: string | null;
  status: MatchStatus;
  deviations?: Deviation[] | null;
  source?: "manual" | "csv" | "pdf" | "ocr" | "llm";
  reviewKind?: "geel" | "variant" | "onvolledig" | "ocr" | null;
  noMatchReason?: string | null;
  manualPrice?: string | null;
  matchedProductId: string | null;
  matchedName: string | null;
  matchedBrand: string | null;
  matchedArticleCode: string | null;
  matchedPrice: string | null;
  // B3: wie de match koos — 'system:auto' toont het label "automatisch geaccepteerde
  // bijna-match" onder de afwijkingsnotitie.
  chosenBy?: string | null;
};

export type Candidate = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  supplierArticleCode: string | null;
  categoryPath: string | null;
  kelvin: number | null;
  cri: number | null;
  ipValue: string | null;
  lumenOutput: number | null;
  grossPrice: string | null;
  // Ijzeren regel 3 (herschreven 19 aug 2026): een vervallen product is vindbaar zónder
  // bedrag. `grossPrice` is dan NULL en dit veld zegt waaróm — zie lib/prijstoestand.ts.
  // Bewust VERPLICHT: een nieuw scherm dat een kandidaat samenstelt moet zich uitspreken,
  // anders verdwijnt de rode markering stilzwijgend op precies dat ene scherm.
  priceState: Prijstoestand;
  lastPriceListName: string | null;
  lastPriceListValidUntil: string | null;
  matchKind: "exact" | "fuzzy";
  // vijfstatussen-verrijking (optioneel; nieuwe match-pagina vult deze)
  deviations?: Deviation[];
  list?: "aantoonbaar" | "onvolledig";
};

// Een echte kleurvariant uit de catalogus (zusterproduct, lib/repo/variants.ts).
export type ColorVariantOption = {
  productId: string;
  color: string; // zoals de productnaam hem draagt, bv. "white" of "black/gold"
  name: string;
};

// Eén AI-suggestie van het vangnet (B4) op een review-/rood-kaart of het regel-detail.
// Alleen niet-verworpen suggesties bereiken de UI; het merk is nodig voor de extra
// render-guard in tender-fase (defense in depth, ijzeren regel 4).
export type AiSuggestionRow = {
  id: string;
  productId: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  rationale: string;
};

// Een kandidaat op de review-kaart ("welke van deze N" / variant-fallback).
export type ReviewCandidate = {
  productId: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  list: "aantoonbaar" | "onvolledig";
  deviations?: Deviation[] | null;
};

// Een review-item in de wachtrij (D-01).
export type ReviewItem = {
  id: string;
  fixtureCode: string;
  brandText: string | null;
  productText: string | null;
  status: MatchStatus;
  reviewKind: "geel" | "variant" | "onvolledig" | "ocr";
  deviations?: Deviation[] | null;
  reqColor?: string | null;
  // Echte kleurvarianten (variantkaart); leeg → fallback op candidates, nooit
  // verzonnen kleuren.
  variants?: ColorVariantOption[];
  // Persistente kandidaten van de regel (voor de "welke van deze N"-kaart en de
  // variant-fallback).
  candidates?: ReviewCandidate[];
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewDecision?: string | null;
  // Niet-verworpen AI-suggesties van het vangnet (B4) voor deze regel.
  aiSuggestions?: AiSuggestionRow[];
  // OCR-herkomst (bouwstap 7/8): pagina + run voor de "View page image"-link op
  // de OcrCard — zodat de reviewer het boek naast de gelezen waarden kan leggen.
  sourcePage?: number | null;
  importRunId?: string | null;
  // Bestaat het paginabeeld van DEZE regel (run + eigen source_page)? Alleen true
  // geeft de beeldlink. false/ontbrekend = AI-tekstroute (stap 3 fase B, geen
  // beelden), een run met maar een deel van zijn pagina's in beeld (UX-audit 30 jul,
  // bug #2) of een aanroeper die de vlag niet kent: dan linkt de OcrCard naar het
  // markdown-controlespoor van de importrun in plaats van naar een niet-bestaand
  // paginabeeld — dat gaf een kale 404. Er is dus géén "onbekend → tóch de
  // beeldlink"-tak meer (die was ongetest en de enige die 404 kón geven).
  hasPageImage?: boolean;
  // De ruwe tabelregel zoals de import hem las (ImportRow.rawText) van de eigen
  // pagina — dít is waartegen de reviewer de gelezen velden vergelijkt. null =
  // niet eenduidig terug te vinden (bv. de code is na de lezing bijgewerkt); de
  // kaart toont dan liever geen citaat dan het verkeerde. De kaart kapt zelf af
  // voor het oog (line-clamp + uitklappen), de repo-laag alleen als payload-plafond.
  sourceText?: string | null;
};

// Zoekresultaat op de rood-kaart (handmatig linken) — uit visible_products.
export type RedLinkResult = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  grossPrice?: string | null;
  // Regel 3 herschreven: dit is dé plek waar een vervallen product opduikt. De rode regel
  // ontstond juist omdat het bestek een artikelnummer noemt dat wij niet actueel hebben;
  // de handmatige zoekactie moet het dan kunnen vinden én meteen zeggen wat eraan mankeert.
  priceState?: Prijstoestand;
  lastPriceListName?: string | null;
  lastPriceListValidUntil?: string | null;
};

// Een rode regel zonder match in de sectie "Niet gevonden — handmatig linken".
// searchQuery/results zijn gevuld nadat de mens zélf zocht (GET-formulier) — het
// systeem toont hier nooit ongevraagde suggesties (ijzeren regel 4).
export type RedLinkLine = {
  id: string;
  fixtureCode: string;
  brandText: string | null;
  productText: string | null;
  noMatchReason?: string | null;
  searchQuery?: string | null;
  results?: RedLinkResult[] | null;
  // Niet-verworpen AI-suggesties van het vangnet (B4) voor deze regel.
  aiSuggestions?: AiSuggestionRow[];
};

export type ComparedField = {
  label: string;
  reference: string | null;
  candidate: string | null;
  verdict: "better" | "worse" | "equal" | "unknown";
  source: string;
};

export type AlternativeView = {
  id: string;
  name: string;
  brandName: string | null;
  articleCode: string | null;
  kelvin: number | null;
  grossPrice: string | null;
  equivalenceScore: number;
  rationale: string;
  technical: ComparedField[];
  sustainability: ComparedField[];
};

export type WerkvoorbereiderLine = {
  specLineId: string;
  fixtureCode: string;
  quantity: number;
  referenceName: string;
  referenceBrand: string | null;
  alternatives: AlternativeView[];
};

export type QuoteLineRow = {
  id: string;
  fixtureCode: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  status?: MatchStatus;
  zone?: string | null;
};
