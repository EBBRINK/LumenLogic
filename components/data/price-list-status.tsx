// Prijslijst-dekking: verloopt-binnenkort (30/14/7 dagen) + verlopen = dekkingsgat.
// Ijzeren regel 3: een verlopen prijslijst maakt de producten onzichtbaar in de matcher —
// dus verlopen is geen alarm maar een zichtbaar gat dat om een nieuwe lijst vraagt.
//
// UX-audit 30 jul (bug #3) — de badge loog. Hij keek uitsluitend naar de datum, waardoor
// ~30 rijen groen "154 d valid" droegen terwijl hun Products-kolom 0 las. Voor de matcher is
// een geldige lijst met 0 producten exact hetzelfde als een verlopen lijst: nul zichtbare
// producten (ijzeren regel 3). De badge leidt nu af uit geldigheid ÉN dekking, en groen is
// voorbehouden aan rijen waar echt niets aan de hand is.
//
// Besluit O13: hues bevroren. Er komt hier géén token bij en er verandert er geen — de enige
// wijziging is WELKE bestaande tint een rij krijgt (amber i.p.v. groen/blauw bij 0 producten).
import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BrandLifecycleBadge } from "@/components/admin/brand-lifecycle-badge";
import { PriceListExpiryNotice } from "@/components/data/price-list-expiry-notice";
import type { BrandLifecycle } from "@/db/schema";
import { cn } from "@/lib/utils";

export type PriceListRow = {
  id: string;
  name: string;
  brandName: string | null;
  validUntil: string;
  productCount: number;
  daysLeft: number;
  bucket: "verlopen" | "7" | "14" | "30" | "ok";
  // Verplicht, mét `| null`. Eerst stond hier `lifecycle?:`, maar dan is het scherm de enige
  // die dit veld nodig heeft en niemand die het eist: haal `lifecycle: brands.lifecycle` uit
  // de select in lib/repo/enrichment.ts en zowel de compiler als de fixtures blijven groen,
  // terwijl de badge stil verdwijnt. Nu breekt dat op de toewijzing in
  // app/data/price-lists/page.tsx. null = geen merk aan de lijst gekoppeld (LEFT JOIN) en
  // geldt als de norm ('actief'), dus geen badge.
  lifecycle: BrandLifecycle | null;
};

// De zichtbare stand van een rij = de datum-bucket, plus één extra stand 'leeg' voor een
// geldige lijst zonder producten. De standen sluiten elkaar uit, want een rij heeft één
// tint en één label. Let op: dat geldt voor de PRESENTATIE, niet voor de tellingen boven de
// tabel — zie de `soon`-teller hieronder, die bewust weer uit `bucket` komt.
type RowState = PriceListRow["bucket"] | "leeg";

/**
 * De zichtbare stand van één rij. Geëxporteerd omdat /data (de hub) hetzelfde oordeel nodig
 * heeft voor zijn badge; dupliceerde die de predicate, dan liep de badge weer uit de pas met
 * het scherm waar hij naar linkt (UX-audit 30 jul: badge "1" naast een scherm dat 31 gaten
 * meldde). Eén presentatie, één bron — zelfde afweging als BrandLifecycleBadge.
 */
export function rowState(r: PriceListRow): RowState {
  // Verlopen wint altijd: die rij draagt al zijn eigen uitleg en is het sterkste signaal.
  // Deze volgorde is dragend — draai je de twee ifs om, dan leest een verlopen lege lijst
  // "Expires in -36 d · 0 products" (negatieve dagen), verkleurt hij grijs → amber en
  // verdwijnt de colSpan-uitleg eronder. Vastgepind in data-screens.test.tsx.
  if (r.bucket === "verlopen") return "verlopen";
  // Datum in orde, dekking niet. Dit is het gat dat de badge tot 30 jul verzweeg.
  if (r.productCount === 0) return "leeg";
  return r.bucket;
}

/**
 * Dekkingsgat = de matcher haalt nul producten uit deze lijst. Verlopen of leeg, dat maakt
 * voor de matcher geen verschil (ijzeren regel 3). Dit is de predicate achter zowel de amber/
 * grijze tint hier als de badge op /data — precies één definitie, zodat de twee schermen
 * elkaar niet meer kunnen tegenspreken.
 */
export function isCoverageGap(r: PriceListRow): boolean {
  const s = rowState(r);
  return s === "verlopen" || s === "leeg";
}

const STATE_TINT: Record<RowState, string> = {
  verlopen: "bg-status-grey-tint text-status-grey-ink",
  // Dekkingsgat zonder datumprobleem: amber, dezelfde bestaande tint als de
  // verloopt-binnenkort-standen. Nooit groen — groen beweert dat er niets aan de hand is.
  leeg: "bg-status-amber-tint text-status-amber-ink",
  "7": "bg-status-amber-tint text-status-amber-ink",
  "14": "bg-status-amber-tint text-status-amber-ink",
  "30": "bg-status-blue-tint text-status-blue-ink",
  ok: "bg-status-green-tint text-status-green-ink",
};

function stateLabel(r: PriceListRow, state: RowState): string {
  if (state === "verlopen") return `Expired (${Math.abs(r.daysLeft)} d ago)`;
  // De geldigheid blijft in het label staan: "geldig maar leeg" is een ander probleem dan
  // "verlopen", en de gebruiker moet de lijst kunnen laten vullen i.p.v. verlengen.
  if (state === "leeg")
    return r.bucket === "ok"
      ? "Valid · 0 products"
      : `Expires in ${r.daysLeft} d · 0 products`;
  if (state === "ok") return `${r.daysLeft} d valid`;
  return `Expires in ${r.daysLeft} d`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function PriceListStatusTable({ rows }: { rows: PriceListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No price lists in the catalog yet.
      </p>
    );
  }
  const states = rows.map(rowState);
  const gaps = states.filter((s) => s === "verlopen").length;
  const empty = states.filter((s) => s === "leeg").length;
  // Bewust uit `bucket` en NIET uit de samengevouwen stand: een lijst die over 21 dagen
  // verloopt én 0 producten heeft, verloopt nog steeds over 21 dagen. Rekende deze teller mee
  // met de tint, dan zei de kop "1 expiring soon" terwijl de badge één regel lager
  // "Expires in 21 d · 0 products" las — het scherm sprak zichzelf tegen en wie verlengingen
  // plande telde te laag. Tints sluiten elkaar uit, tellingen hoeven dat niet.
  const soon = rows.filter(
    (r) => r.bucket === "7" || r.bucket === "14" || r.bucket === "30",
  ).length;
  // Beide standen zijn hetzelfde soort gat: de matcher ziet er nul producten van. Géén
  // "valid" in deze tekst — een lijst die binnen 30 dagen verloopt staat er ook tussen.
  const gapParts = [
    gaps > 0 ? `${gaps} expired` : null,
    empty > 0 ? `${empty} with 0 products` : null,
  ].filter((s): s is string => s !== null);

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {gapParts.length > 0 && (
          // UX-audit 30 jul: dit is het enige urgente getal op de pagina en het stond in
          // dezelfde grijstint als al het andere. Amber-inkt is precies de bestaande tint die
          // de verloop-uitleg en de amber badges hieronder al dragen — geen nieuw token, en
          // ook niet luider dan de rest van het scherm.
          <span className="font-medium text-status-amber-ink">
            {gapParts.join(" · ")} — coverage gap
            {gaps + empty > 1 ? "s" : ""}
          </span>
        )}
        {gapParts.length > 0 && soon > 0 && (
          <span className="text-muted-foreground"> · </span>
        )}
        {soon > 0 && (
          <span className="text-muted-foreground">{soon} expiring soon</span>
        )}
        {gapParts.length === 0 && soon === 0 && (
          <span className="text-muted-foreground">
            All price lists valid with room to spare.
          </span>
        )}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Price list</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead>Valid until</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const state = states[i];
            return (
              <Fragment key={r.id}>
                {/* De verlopen rij verliest zijn onderrand: hij vormt samen met de
                    uitlegregel eronder één blok. Zonder dat loopt er een streep tussen de
                    badge en zijn eigen verklaring, en hoort de uitleg optisch bij de
                    VOLGENDE rij. Ook de hover van TableRow gaat eraf (op beide <tr>'s):
                    die kleurt per <tr> en lichtte dus alleen de bovenste helft van het blok
                    op — precies de scheiding die border-b-0 weghaalt. */}
                <TableRow
                  className={
                    state === "verlopen"
                      ? "border-b-0 hover:bg-transparent"
                      : undefined
                  }
                >
                  <TableCell className="font-medium">
                    {r.brandName ?? "—"}
                    {/* Dezelfde badge als /admin/brands (één presentatie, geen tweede
                        kopie): een merk dat niet meer bestaat — 'Lucente (BESTAAT NIET
                        MEER)' in de brondata — mag hier geen schone groene rij zijn. */}
                    <BrandLifecycleBadge
                      lifecycle={r.lifecycle}
                      className="ml-2"
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.productCount}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {fmtDate(r.validUntil)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                        STATE_TINT[state],
                      )}
                    >
                      {stateLabel(r, state)}
                    </span>
                  </TableCell>
                </TableRow>
                {/* Sprint 1.6 (deel B): lichtste variant — dit scherm gaat over lijsten,
                    niet over merken. Zelfde gedeelde component als de merkschermen, dus deze
                    regel kan nooit uit de pas gaan lopen met de banner/badge.
                    UX-audit 30 jul: de uitleg stond IN de Status-cel, de smalste kolom van de
                    tabel (~290px). Daar brak hij over drie regels, duwde de badge op een
                    eigen regel boven de andere cellen en maakte de rij ~90px hoog. Hij staat
                    nu als eigen regel onder de rij, over de volle tabelbreedte: het
                    belangrijkste bericht van de pagina krijgt de breedste plek in plaats van
                    de smalste, elke cel blijft één regel hoog en het blijft bij de rij
                    horen. Bewust géén banner bovenaan: de zin noemt merk + einddatum die de
                    rij al draagt, en met meerdere verlopen lijsten zou dat de tabel boven de
                    tabel worden. */}
                {state === "verlopen" && (
                  <TableRow className="hover:bg-transparent">
                    {/* whitespace-normal overschrijft TableCell's whitespace-nowrap
                        (components/ui/table.tsx) — anders knipt de regel niet af maar rekt
                        hij de tabel op. */}
                    <TableCell
                      colSpan={5}
                      className="whitespace-normal pt-0 text-left"
                    >
                      <PriceListExpiryNotice
                        indicator="verlopen"
                        validUntil={r.validUntil}
                        variant="inline"
                        brandName={r.brandName ?? undefined}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
