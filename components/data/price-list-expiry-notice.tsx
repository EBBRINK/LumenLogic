// Prijslijst-verloop-waarschuwing (sprint 1.6, deel B, besluit G8): één component,
// hergebruikt op elk scherm waar het merk als rij of als pagina voorkomt (merkpagina,
// /admin/brands, /data/price-lists) — nooit vier losse implementaties die uit elkaar
// kunnen lopen (zie hoe field-catalog.measure vijf weken achterliep op het schema).
//
// De tekst zegt wat je moet DOEN: het merk heeft wél geleverd, de lijst is verlopen, je
// hebt een VERLENGING nodig ("extension") — geen nieuwe aanlevering. Noemt de einddatum.
// Toont NOOIT een bedrag (ijzeren regel 2) — er is bewust geen prop voor een bedrag en
// die komt er ook niet.
//
// Server-component, geen client-JS, geen lucide-react — precedent brand-scorecard.tsx
// (~regel 100 aldaar): de RSC-testbrug struikelt over de client-referentie van lucide.
//
// `indicator` komt uit priceListIndicator() in lib/repo/brand-relations.ts. Deze
// component herhaalt de datumlogica NIET — hij toont alleen wat die functie al besliste.
import type { PriceListIndicator } from "@/lib/repo/brand-relations";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

// Eén tekstbouwer voor alle drie de varianten, zodat ze nooit uit elkaar lopen. Alleen de
// omhulling hieronder verschilt per scherm-gewicht — de inhoud is overal hetzelfde.
function noticeText(validUntil: string | null, brandName?: string): string {
  const subject = brandName ?? "This brand";
  const date = validUntil ? fmtDate(validUntil) : "an earlier date";
  return `${subject} delivered prices — the list expired on ${date}. What's needed now is an extension, not a new submission.`;
}

export function PriceListExpiryNotice({
  indicator,
  validUntil,
  variant,
  brandName,
  href,
}: {
  indicator: PriceListIndicator;
  validUntil: string | null;
  variant: "banner" | "inline" | "badge";
  brandName?: string;
  href?: string;
}) {
  // Alleen "verlopen" verklaart een gat dat verklaring nodig heeft; de andere drie standen
  // (geldig, verloopt-binnenkort, ontbreekt) hebben hun eigen bestaande badges elders.
  if (indicator !== "verlopen") return null;
  const text = noticeText(validUntil, brandName);

  let content: React.ReactNode;
  if (variant === "banner") {
    content = (
      <div
        role="note"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        <p className="font-medium">Price list expired</p>
        <p className="mt-1">{text}</p>
      </div>
    );
  } else if (variant === "badge") {
    content = (
      <span
        title={text}
        className="inline-flex max-w-[18rem] items-center rounded-md bg-amber-100 px-2 py-1 text-xs font-medium leading-snug text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      >
        {text}
      </span>
    );
  } else {
    // "inline" — bewust het lichtste gewicht: een screen dat over lijsten gaat, niet
    // over merken, mag geen kaart of pil krijgen.
    content = (
      <span className="text-xs text-amber-800 dark:text-amber-300">
        {text}
      </span>
    );
  }

  if (!href) return content;
  return (
    <a
      href={href}
      className={variant === "banner" ? "block" : "inline-block hover:underline"}
    >
      {content}
    </a>
  );
}
