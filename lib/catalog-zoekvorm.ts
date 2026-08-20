// De vorm van het catalogus-zoekformulier, op één plek. Twee lezers delen deze definitie:
// de servercomponent app/catalog/page.tsx (leest de query-string na een echte zoekactie)
// en de server action countCatalogMatches (telt live mee tijdens het typen). Die moeten
// dezelfde velden op dezelfde manier lezen — een teller die "IP44" anders parseert dan de
// pagina, noemt een getal dat na de enter niet terugkomt.
import { z, zOptionalInt, zTrimmed } from "@/lib/validation";
import type { HerkendToken } from "@/lib/spec-tokens";

// IP-code ("IP44") → beschermingsgetal (44). Hoger = meer bescherming, dus bruikbaar als
// ondergrens-vergelijking. Geen match → null (onbekend, niet 0).
export function ipNumber(v: string | null): number | null {
  const m = String(v ?? "").match(/(\d{2})/);
  return m ? Number.parseInt(m[1], 10) : null;
}

// De vijf zoekvelden zoals ze uit FormData komen. Ontbrekende velden zijn "niet ingevuld",
// geen fout — het formulier stuurt ze altijd mee, maar de action hoort niet te crashen op
// een handgemaakte aanroep zonder.
export const zCatalogZoek = z.object({
  brand: zTrimmed.optional().default(""),
  q: zTrimmed.optional().default(""),
  kelvin: zOptionalInt,
  cri: zOptionalInt,
  ip: zTrimmed.optional().default(""),
});

export type CatalogZoek = z.infer<typeof zCatalogZoek>;

// Het antwoord van de live-tel-action. Hier gedefinieerd (en niet in de action zelf) zodat
// de clientcomponent het type kan importeren zonder een "use server"-module aan te raken.
export type CountOutcome =
  | {
      ok: true;
      total: number;
      /**
       * Is er teruggevallen op de brede variant (≥1 zoekwoord i.p.v. allemaal)? Dan meldt
       * de teller dat erbij. Stil verbreden zou het getal onbegrijpelijk maken: je typt een
       * woord erbij en de stapel wordt groter.
       */
      verbreed: boolean;
      /**
       * Welke specwaarden er uit de vrije tekst gelezen zijn ("2700" → kleurtemperatuur).
       * De teller toont ze, want raden dat je niet ziet is niet te corrigeren.
       */
      herkend: HerkendToken[];
    }
  | { ok: false; error: string };
