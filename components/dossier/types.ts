// Gedeelde vormtypes voor de presentational componenten. Bewust losgekoppeld van de
// repo zodat de componenten met fixtures getest kunnen worden (screenshots).
export type Phase = "tender" | "awarded";

export type DossierSummary = {
  id: string;
  name: string;
  customer: string | null;
  phase: Phase;
};

export type SpecLineRow = {
  id: string;
  fixtureCode: string;
  quantity: number;
  brandText: string | null;
  productText: string | null;
  reqKelvin: number | null;
  reqCri: number | null;
  reqIp: string | null;
  status: "open" | "matched" | "no_match";
  matchedProductId: string | null;
  matchedName: string | null;
  matchedBrand: string | null;
  matchedArticleCode: string | null;
  matchedPrice: string | null;
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
};

export type QuoteLineRow = {
  id: string;
  fixtureCode: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};
