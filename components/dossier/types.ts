// Gedeelde vormtypes voor de presentational componenten. Bewust losgekoppeld van de
// repo zodat de componenten met fixtures getest kunnen worden (screenshots).
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
  matchKind: "exact" | "fuzzy";
  // vijfstatussen-verrijking (optioneel; nieuwe match-pagina vult deze)
  deviations?: Deviation[];
  list?: "aantoonbaar" | "onvolledig";
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
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewDecision?: string | null;
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
