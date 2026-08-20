import { DriverWaarschuwing } from "@/components/driver-waarschuwing";
import { isLosOnderdeel } from "@/lib/onderdeel-signaal";
import { merkenMetLosseOnderdelen } from "@/lib/repo/onderdeel-merken";
import Link from "next/link";
import { notFound } from "next/navigation";
import { leesPrijstoestand } from "@/lib/prijstoestand";
import { VervallenMarkering } from "@/components/vervallen-markering";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { AiSuggestionBlock } from "@/components/dossier/ai-suggestion-block";
import { DeviationTable } from "@/components/dossier/deviation-table";
import {
  MatchCandidates,
  type RegelCandidate,
} from "@/components/dossier/match-candidates";
import { RequestedArticleCode } from "@/components/dossier/requested-article-code";
import { StatusBadge } from "@/components/dossier/status-badge";
import { IconUnlock } from "@/components/dossier/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Deviation, MatchStatus } from "@/components/dossier/types";
import { getOpenSuggestionsForLine } from "@/lib/repo/ai-suggestions";
import { getDossier, getSpecLine } from "@/lib/repo/dossiers";
import { getCandidates } from "@/lib/repo/matching";
import { articleCodeExists, getVisibleProduct } from "@/lib/repo/products";
import { formatEur } from "@/lib/format";
import { requireUuid } from "@/lib/uuid";
import {
  chooseCandidateAction,
  dismissAiSuggestionAction,
  editSpecLineAction,
  runMatchAction,
  setDayPriceAction,
  setLineStatusAction,
  unlinkMatchAction,
  useAiSuggestionAction,
} from "../../../actions";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

const SOURCE_LABEL: Record<string, string> = {
  manual: "manual",
  csv: "CSV",
  pdf: "PDF",
  ocr: "OCR",
  llm: "LLM",
};

// Regel-detail (functioneel ontwerp §3.6). Binnen de dossier-layout: die rendert de
// hoofd-header, fasebadge, tally en tabs al — dit scherm levert alléén zijn eigen inhoud
// (fragment), met een kleine sub-terug-link naar de regels.
export default async function RegelDetailPage({
  params,
}: {
  params: Promise<{ id: string; lineId: string }>;
}) {
  const toegang = await bewaakRoute("/projects/[id]/line/[lineId]");
  const { id, lineId } = await params;
  // Beide uuid-kolommen (project_dossiers.id, spec_lines.id) — de kruislek-check op
  // regel hieronder komt pas ná de cast en vangt dit dus niet af.
  requireUuid(id, lineId);
  const [dossier, specLine] = await Promise.all([
    getDossier(db, toegangScope(toegang), id),
    getSpecLine(db, lineId),
  ]);
  if (!dossier || !specLine || specLine.dossierId !== dossier.id) notFound();

  // Persistente kandidaten (C-10) verrijkt met hun nog-zichtbare productdata. Een product
  // waarvan de prijslijst verlopen is, is niet meer zichtbaar (regel 3) → dan tonen we de
  // kandidaat zonder prijs/specs in plaats van hem stil te laten verdwijnen.
  const rawCandidates = await getCandidates(db, specLine.id);
  const products = await Promise.all(
    rawCandidates.map((c) => getVisibleProduct(db, c.productId)),
  );
  const allCandidates: RegelCandidate[] = rawCandidates.map((c, i) => {
    const p = products[i];
    return {
      id: c.productId,
      name: p?.name ?? "(product no longer visible)",
      brandName: p?.brandName ?? null,
      articleCode: p?.articleCode ?? null,
      supplierArticleCode: p?.supplierArticleCode ?? null,
      categoryPath: p?.categoryPath ?? null,
      kelvin: p?.kelvin ?? null,
      cri: p?.cri ?? null,
      ipValue: p?.ipValue ?? null,
      lumenOutput: p?.lumenOutput ?? null,
      grossPrice: p?.grossPrice ?? null,
      // Regel 3, herschreven: het product is nu zichtbaar mét zijn toestand. Een kandidaat
      // waarvan het product helemaal niet meer in de view staat (nooit geprijsd, of
      // verwijderd) blijft "(product no longer visible)" — leesPrijstoestand zet die op
      // 'uit_prijslijst', de veilige kant.
      priceState: leesPrijstoestand(p?.priceState),
      lastPriceListName: p?.lastPriceListName ?? null,
      lastPriceListValidUntil: p?.lastPriceListValidUntil ?? null,
      matchKind: "fuzzy",
      deviations: (c.verdicts ?? []) as Deviation[],
      list: c.list === "onvolledig" ? "onvolledig" : "aantoonbaar",
      chosen: c.chosen,
    };
  });
  const provable = allCandidates.filter((c) => c.list === "aantoonbaar");
  const incomplete = allCandidates.filter((c) => c.list === "onvolledig");

  const matched = specLine.matchedProductId
    ? await getVisibleProduct(db, specLine.matchedProductId)
    : null;

  // AI-vangnet (B4): niet-verworpen suggesties voor deze regel — zelfde blok als op
  // de review-kaarten, met dezelfde tender-render-guard in het component.
  const aiSuggestions = await getOpenSuggestionsForLine(db, specLine.id);

  // Vroeg de klant een artikelnummer dat wij niet kennen? Dan blijft de tekstroute
  // gewoon zijn kandidaten tonen (besluit Timo, B5), maar de gebruiker hoort te zien
  // dat die kandidaten NIET het gevraagde artikel zijn. Zonder deze melding leek een
  // ontbrekende import op een geslaagde match: gemeten leverde `32812 9220 BRBB` acht
  // SPY 52 CLIP-varianten op terwijl de hele LUNELLE-familie in de catalogus ontbreekt.
  const codeOnbekend =
    specLine.reqArticleCode != null &&
    !(await articleCodeExists(db, specLine.reqArticleCode));

  // Driver-waarschuwing (demo 12 aug): voert het merk van dit armatuur losse drivers of
  // accessoires? Dan alleen de herinnering om na te vragen — geen koppeling, geen gok over
  // wélke driver (docs/goal-vervallen-producten.md, deel 3).
  //
  // Alleen over het GEMATCHTE product, en alleen als dat zelf geen los onderdeel is: staat
  // er al een driver op de regel, dan is de vraag beantwoord. Dit scherm toont één
  // armatuur, dus hier mag de waarschuwing bij de regel staan; op de offerte staat hij
  // gegroepeerd (zie components/driver-waarschuwing.tsx).
  const onderdeelMerken =
    matched && !isLosOnderdeel(matched.name)
      ? await merkenMetLosseOnderdelen(db, [matched.brandName])
      : new Set<string>();
  const driverMerken = [...onderdeelMerken];

  // Gevraagde kernvelden: alleen wat is ingevuld is een matcheis (B-09).
  const requested: { label: string; value: string | number }[] = [];
  if (specLine.reqKelvin != null)
    requested.push({ label: "Color temperature", value: `${specLine.reqKelvin}K` });
  if (specLine.reqCri != null)
    requested.push({ label: "CRI", value: specLine.reqCri });
  if (specLine.reqIp) requested.push({ label: "IP value", value: specLine.reqIp });
  if (specLine.reqWatt != null)
    requested.push({ label: "Power", value: `${specLine.reqWatt} W` });
  if (specLine.reqLumen != null)
    requested.push({ label: "Lumen output", value: `${specLine.reqLumen} lm` });
  if (specLine.reqBeamAngle != null)
    requested.push({ label: "Beam angle", value: `${specLine.reqBeamAngle}°` });
  if (specLine.reqSizeCm != null)
    requested.push({ label: "Size", value: `${specLine.reqSizeCm} cm` });
  if (specLine.reqShape)
    requested.push({ label: "Shape", value: specLine.reqShape });
  if (specLine.reqColor)
    requested.push({ label: "Color", value: specLine.reqColor });
  if (specLine.reqDimmable)
    requested.push({ label: "Dimmable", value: specLine.reqDimmable });

  return (
    <>
      <Link
        href={`/projects/${dossier.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Lines
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Line {specLine.fixtureCode}
        </h2>
        <StatusBadge status={specLine.status as MatchStatus} />
      </div>

      <DriverWaarschuwing merken={driverMerken} variant="regel" className="mb-5" />

      {/* B-10: regel bewerken → matcher draait opnieuw. */}
      <details className="mb-5 rounded-lg border">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
          Edit line
        </summary>
        <form action={editSpecLineAction} className="border-t p-4">
          <input type="hidden" name="dossierId" value={dossier.id} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["fixtureCode", "Code", specLine.fixtureCode, "text"],
                ["quantity", "Quantity", specLine.quantity ?? "", "number"],
                ["zone", "Zone", specLine.zone ?? "", "text"],
                ["brandText", "Brand", specLine.brandText ?? "", "text"],
                ["productText", "Type", specLine.productText ?? "", "text"],
                [
                  "reqArticleCode",
                  "Article number",
                  specLine.reqArticleCode ?? "",
                  "text",
                ],
                ["reqKelvin", "Kelvin", specLine.reqKelvin ?? "", "number"],
                ["reqCri", "CRI", specLine.reqCri ?? "", "number"],
                ["reqIp", "IP", specLine.reqIp ?? "", "text"],
                ["reqWatt", "Watt", specLine.reqWatt ?? "", "text"],
                ["reqLumen", "Lumen", specLine.reqLumen ?? "", "number"],
                ["reqBeamAngle", "Beam angle", specLine.reqBeamAngle ?? "", "text"],
                ["reqSizeCm", "Size (cm)", specLine.reqSizeCm ?? "", "text"],
                ["reqShape", "Shape", specLine.reqShape ?? "", "text"],
                ["reqColor", "Color", specLine.reqColor ?? "", "text"],
                ["reqDimmable", "Dimmable", specLine.reqDimmable ?? "", "text"],
              ] as const
            ).map(([name, label, value, type]) => (
              <label key={name} className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <input
                  name={name}
                  type={type}
                  defaultValue={String(value)}
                  required={name === "fixtureCode"}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Changing brand, type or specs re-runs the matcher.
          </p>
          <div className="mt-2">
            {/* Echte submit → `outline` in plaats van het neutrale vlak; hij draait de
                matcher opnieuw. De primary van dit scherm is "Choose" op een
                aantoonbare kandidaat (DESIGN.md §6). */}
            <Button type="submit" size="sm" variant="outline">
              Save &amp; re-match
            </Button>
          </div>
        </form>
      </details>

      <div className="grid gap-4 md:grid-cols-2">
        {/* GEVRAAGD */}
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Requested</h3>
          <p className="mt-1">
            <span className="text-muted-foreground">
              {specLine.brandText ?? "brand unknown"}
            </span>{" "}
            <span className="font-medium">
              {specLine.productText ?? specLine.fixtureCode}
            </span>
          </p>
          <RequestedArticleCode
            code={specLine.reqArticleCode}
            known={!codeOnbekend}
          />
          {requested.length > 0 ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {requested.map((r) => (
                <div key={r.label} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="tabular-nums">{r.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No core specs given — only brand/type is the match requirement.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Source: {SOURCE_LABEL[specLine.source] ?? specLine.source}
            {specLine.zone ? ` · zone ${specLine.zone}` : ""}
            {specLine.quantity != null
              ? ` · ${specLine.quantity} units`
              : " · quantity to follow"}
          </p>
        </section>

        {/* GEKOZEN MATCH */}
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Chosen match</h3>
          {matched ? (
            <>
              <p className="mt-1">
                <span className="text-muted-foreground">{matched.brandName}</span>{" "}
                <span className="font-medium">{matched.name}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {matched.articleCode ?? "—"}
                {/* Regel 3, herschreven: bij een vervallen product is er geen bedrag, en
                    dan is "— each" een leeg streepje zonder uitleg. De markering eronder
                    zegt wát er aan de hand is en welke prijslijst de laatste was. */}
                {matched.grossPrice != null && (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {formatEur(matched.grossPrice)}
                    </span>{" "}
                    each
                  </>
                )}
              </p>
              <VervallenMarkering
                toestand={leesPrijstoestand(matched.priceState)}
                stempel={{
                  name: matched.lastPriceListName,
                  validUntil: matched.lastPriceListValidUntil,
                }}
                brandName={matched.brandName}
                variant="inline"
                className="mt-2"
              />
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Button asChild size="sm" variant="ghost">
                  <a href="#kandidaten">Change match</a>
                </Button>
              </div>
              <form
                action={unlinkMatchAction}
                className="mt-2 flex items-end gap-2 border-t pt-3"
              >
                <input type="hidden" name="dossierId" value={dossier.id} />
                <input type="hidden" name="specLineId" value={specLine.id} />
                <label className="flex-1 text-xs text-muted-foreground">
                  Reason for unlinking (required)
                  <Input
                    name="reason"
                    required
                    placeholder="e.g. wrong type chosen"
                    className="mt-1"
                  />
                </label>
                <Button type="submit" size="sm" variant="outline">
                  <IconUnlock /> Unlink
                </Button>
              </form>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No product chosen yet. Choose a candidate below, or resolve the line
              honestly.
            </p>
          )}
        </section>
      </div>

      {/* AI-SUGGESTIES (B4) — duidelijk gelabeld, kiezen blijft menswerk. */}
      {aiSuggestions.length > 0 && (
        <section className="mt-6">
          <AiSuggestionBlock
            dossierId={dossier.id}
            specLineId={specLine.id}
            suggestions={aiSuggestions}
            phase={dossier.phase === "awarded" ? "awarded" : "tender"}
            brandText={specLine.brandText}
            useAction={useAiSuggestionAction}
            dismissAction={dismissAiSuggestionAction}
          />
        </section>
      )}

      {/* AFWIJKINGEN — altijd getoond, ook binnen groen (transparantieregel C-07). */}
      <section className="mt-6">
        <h3 className="text-sm font-medium">Deviations</h3>
        {/* UX-audit 30 jul (item 12): de tweede zin ("&ldquo;No data&rdquo; is an honest
            gray flag, not an error.") is weg — de grijze vlag mét het woord "no data"
            staat in de tabel eronder en legt zichzelf uit. Wat blijft is wat de tabel
            toont, niet waarom het beleid klopt. */}
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Every requested field comes back with its verdict — including the fields
          that match.
        </p>
        <DeviationTable deviations={specLine.deviations as Deviation[] | null} />
      </section>

      {/* KANDIDATEN + AFRONDING */}
      <section id="kandidaten" className="mt-6 scroll-mt-6">
        <h3 className="mb-3 text-sm font-medium">Candidates</h3>
        <MatchCandidates
          dossierId={dossier.id}
          specLine={{
            id: specLine.id,
            fixtureCode: specLine.fixtureCode,
            brandText: specLine.brandText,
            productText: specLine.productText,
          }}
          provable={provable}
          incomplete={incomplete}
          chooseAction={chooseCandidateAction}
          setLineStatusAction={setLineStatusAction}
          setDayPriceAction={setDayPriceAction}
          runMatchAction={runMatchAction}
        />
      </section>
    </>
  );
}
