"use client";
// Test-only client-stubs voor catalog-live-count.test.tsx. Zelfde reden als
// components/settings/password-block-test-stubs.tsx: de vitest-RSC-brug staat geen kale
// functies toe die van de (server-side) testfile naar een clientcomponent oversteken,
// tenzij ze een "use server"-referentie zijn. Deze stubs zijn zelf al client, dus de
// stub-telactie hoeft nooit de grens over.
import { CatalogSearchForm } from "./catalog-search-form";
import type { CatalogValues, CatalogResult } from "./catalog-search";
import { CatalogSearch } from "./catalog-search";
import type { CountOutcome } from "@/lib/catalog-zoekvorm";
import type { HerkendToken } from "@/lib/spec-tokens";

declare global {
  interface Window {
    __countCalls?: { brand: string; q: string }[];
  }
}

const LEEG: CatalogValues = { brand: "", q: "", kelvin: "", cri: "", ip: "" };

// Het klantvoorbeeld uit de demosessie: hoe langer de zoektekst, hoe kleiner het getal.
async function telMee(formData: FormData): Promise<CountOutcome> {
  const brand = String(formData.get("brand") ?? "");
  const q = String(formData.get("q") ?? "");
  if (typeof window !== "undefined") {
    window.__countCalls = [...(window.__countCalls ?? []), { brand, q }];
  }
  const total = q.length >= 10 ? 75 : q.length >= 4 ? 375 : 719;
  return { ok: true, total, verbreed: false, herkend: [] };
}

// Dezelfde stub, maar de zoekopdracht viel terug op de brede variant: geen enkel product
// bevat álle getypte woorden. De teller hoort dat te melden in plaats van alleen een groter
// getal te tonen.
async function telMeeVerbreed(formData: FormData): Promise<CountOutcome> {
  const q = String(formData.get("q") ?? "");
  return { ok: true, total: q.length >= 10 ? 412 : 719, verbreed: true, herkend: [] };
}

export function VormMetVerbredeTeller() {
  return (
    <CatalogSearchForm
      brands={["Delta Light", "XAL"]}
      values={LEEG}
      countAction={telMeeVerbreed}
    />
  );
}

const altijdOngeldig = async (): Promise<CountOutcome> => ({
  ok: false,
  error: "kelvin: geen geldig getal",
});

export function VormMetTeller() {
  return (
    <CatalogSearchForm
      brands={["Delta Light", "XAL"]}
      values={LEEG}
      countAction={telMee}
    />
  );
}

export function VormMetOngeldigeInvoer() {
  return (
    <CatalogSearchForm
      brands={["Delta Light"]}
      values={LEEG}
      countAction={altijdOngeldig}
    />
  );
}

// Voor de screenshots: het hele zoekscherm mét resultaten, waarin de teller live
// meebeweegt zodra er getypt wordt.
export function SchermMetTeller({
  aantoonbaar,
  total,
  verbreed = false,
  herkend = [],
}: {
  aantoonbaar: CatalogResult[];
  total: number;
  verbreed?: boolean;
  herkend?: HerkendToken[];
}) {
  return (
    <CatalogSearch
      brands={["Delta Light", "XAL"]}
      values={{ brand: "Delta Light", q: "Ent", kelvin: "", cri: "", ip: "" }}
      aantoonbaar={aantoonbaar}
      onvolledig={[]}
      searched
      total={total}
      verbreed={verbreed}
      herkend={herkend}
      countAction={telMee}
    />
  );
}

// De herkenner in actie: "Entero 2700" leest 2700 als kleurtemperatuur en versmalt daarmee,
// in plaats van als naamwoord te zoeken naar iets wat niet in de naam staat.
const GERADEN_KELVIN: HerkendToken[] = [
  { token: "2700", veld: "kelvin", waarde: 2700, toegepast: true },
];

async function telMeeMetHerkenning(formData: FormData): Promise<CountOutcome> {
  const q = String(formData.get("q") ?? "");
  return {
    ok: true,
    total: q.length >= 10 ? 1026 : 1408,
    verbreed: false,
    herkend: q.length >= 10 ? GERADEN_KELVIN : [],
  };
}

export function VormMetHerkenning() {
  return (
    <CatalogSearchForm
      brands={["Delta Light", "XAL"]}
      values={LEEG}
      countAction={telMeeMetHerkenning}
    />
  );
}
