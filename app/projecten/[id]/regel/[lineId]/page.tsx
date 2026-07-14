import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { DeviationTable } from "@/components/dossier/deviation-table";
import {
  MatchCandidates,
  type RegelCandidate,
} from "@/components/dossier/match-candidates";
import { StatusBadge } from "@/components/dossier/status-badge";
import { IconUnlock } from "@/components/dossier/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Deviation, MatchStatus } from "@/components/dossier/types";
import { getDossier, getSpecLine } from "@/lib/repo/dossiers";
import { getCandidates } from "@/lib/repo/matching";
import { getVisibleProduct } from "@/lib/repo/products";
import { formatEur } from "@/lib/format";
import { requireSession } from "@/lib/session";
import {
  chooseCandidateAction,
  editSpecLineAction,
  runMatchAction,
  setDayPriceAction,
  setLineStatusAction,
  unlinkMatchAction,
} from "../../../actions";

const SOURCE_LABEL: Record<string, string> = {
  manual: "handmatig",
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
  await requireSession();
  const { id, lineId } = await params;
  const [dossier, specLine] = await Promise.all([
    getDossier(db, id),
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
      name: p?.name ?? "(product niet meer zichtbaar)",
      brandName: p?.brandName ?? null,
      articleCode: p?.articleCode ?? null,
      supplierArticleCode: p?.supplierArticleCode ?? null,
      categoryPath: p?.categoryPath ?? null,
      kelvin: p?.kelvin ?? null,
      cri: p?.cri ?? null,
      ipValue: p?.ipValue ?? null,
      lumenOutput: p?.lumenOutput ?? null,
      grossPrice: p?.grossPrice ?? null,
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

  // Gevraagde kernvelden: alleen wat is ingevuld is een matcheis (B-09).
  const requested: { label: string; value: string | number }[] = [];
  if (specLine.reqKelvin != null)
    requested.push({ label: "Kleurtemperatuur", value: `${specLine.reqKelvin}K` });
  if (specLine.reqCri != null)
    requested.push({ label: "CRI", value: specLine.reqCri });
  if (specLine.reqIp) requested.push({ label: "IP-waarde", value: specLine.reqIp });
  if (specLine.reqWatt != null)
    requested.push({ label: "Vermogen", value: `${specLine.reqWatt} W` });
  if (specLine.reqLumen != null)
    requested.push({ label: "Lichtstroom", value: `${specLine.reqLumen} lm` });
  if (specLine.reqBeamAngle != null)
    requested.push({ label: "Straalhoek", value: `${specLine.reqBeamAngle}°` });
  if (specLine.reqSizeCm != null)
    requested.push({ label: "Maat", value: `${specLine.reqSizeCm} cm` });
  if (specLine.reqShape)
    requested.push({ label: "Vorm", value: specLine.reqShape });
  if (specLine.reqColor)
    requested.push({ label: "Kleur", value: specLine.reqColor });
  if (specLine.reqDimmable)
    requested.push({ label: "Dimbaar", value: specLine.reqDimmable });

  return (
    <>
      <Link
        href={`/projecten/${dossier.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Regels
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Regel {specLine.fixtureCode}
        </h2>
        <StatusBadge status={specLine.status as MatchStatus} />
      </div>

      {/* B-10: regel bewerken → matcher draait opnieuw. */}
      <details className="mb-5 rounded-lg border">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
          Regel bewerken
        </summary>
        <form action={editSpecLineAction} className="border-t p-4">
          <input type="hidden" name="dossierId" value={dossier.id} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["fixtureCode", "Code", specLine.fixtureCode, "text"],
                ["quantity", "Aantal", specLine.quantity ?? "", "number"],
                ["zone", "Zone", specLine.zone ?? "", "text"],
                ["brandText", "Merk", specLine.brandText ?? "", "text"],
                ["productText", "Type", specLine.productText ?? "", "text"],
                ["reqKelvin", "Kelvin", specLine.reqKelvin ?? "", "number"],
                ["reqCri", "CRI", specLine.reqCri ?? "", "number"],
                ["reqIp", "IP", specLine.reqIp ?? "", "text"],
                ["reqWatt", "Watt", specLine.reqWatt ?? "", "text"],
                ["reqLumen", "Lumen", specLine.reqLumen ?? "", "number"],
                ["reqBeamAngle", "Straalhoek", specLine.reqBeamAngle ?? "", "text"],
                ["reqSizeCm", "Maat (cm)", specLine.reqSizeCm ?? "", "text"],
                ["reqShape", "Vorm", specLine.reqShape ?? "", "text"],
                ["reqColor", "Kleur", specLine.reqColor ?? "", "text"],
                ["reqDimmable", "Dimbaar", specLine.reqDimmable ?? "", "text"],
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
            Merk, type of specs wijzigen draait de matcher opnieuw.
          </p>
          <div className="mt-2">
            <Button type="submit" size="sm" variant="secondary">
              Opslaan &amp; opnieuw matchen
            </Button>
          </div>
        </form>
      </details>

      <div className="grid gap-4 md:grid-cols-2">
        {/* GEVRAAGD */}
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Gevraagd</h3>
          <p className="mt-1">
            <span className="text-muted-foreground">
              {specLine.brandText ?? "merk onbekend"}
            </span>{" "}
            <span className="font-medium">
              {specLine.productText ?? specLine.fixtureCode}
            </span>
          </p>
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
              Geen kernspecs opgegeven — alleen merk/type is de matcheis.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Herkomst: {SOURCE_LABEL[specLine.source] ?? specLine.source}
            {specLine.zone ? ` · zone ${specLine.zone}` : ""}
            {specLine.quantity != null
              ? ` · ${specLine.quantity} stuks`
              : " · aantal volgt"}
          </p>
        </section>

        {/* GEKOZEN MATCH */}
        <section className="rounded-lg border p-4">
          <h3 className="text-sm font-medium">Gekozen match</h3>
          {matched ? (
            <>
              <p className="mt-1">
                <span className="text-muted-foreground">{matched.brandName}</span>{" "}
                <span className="font-medium">{matched.name}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {matched.articleCode ?? "—"} ·{" "}
                <span className="tabular-nums">
                  {formatEur(matched.grossPrice)}
                </span>{" "}
                per stuk
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Button asChild size="sm" variant="ghost">
                  <a href="#kandidaten">Wijzig match</a>
                </Button>
              </div>
              <form
                action={unlinkMatchAction}
                className="mt-2 flex items-end gap-2 border-t pt-3"
              >
                <input type="hidden" name="dossierId" value={dossier.id} />
                <input type="hidden" name="specLineId" value={specLine.id} />
                <label className="flex-1 text-xs text-muted-foreground">
                  Reden voor losmaken (verplicht)
                  <Input
                    name="reason"
                    required
                    placeholder="bv. verkeerd type gekozen"
                    className="mt-1"
                  />
                </label>
                <Button type="submit" size="sm" variant="outline">
                  <IconUnlock /> Maak los
                </Button>
              </form>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Nog geen product gekozen. Kies hieronder een kandidaat, of rond de regel
              eerlijk af.
            </p>
          )}
        </section>
      </div>

      {/* AFWIJKINGEN — altijd getoond, ook binnen groen (transparantieregel C-07). */}
      <section className="mt-6">
        <h3 className="text-sm font-medium">Afwijkingen</h3>
        <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
          Elk gevraagd veld komt terug met zijn oordeel — ook de velden die kloppen.
          &ldquo;Geen data&rdquo; is een eerlijke grijze vlag, geen fout.
        </p>
        <DeviationTable deviations={specLine.deviations as Deviation[] | null} />
      </section>

      {/* KANDIDATEN + AFRONDING */}
      <section id="kandidaten" className="mt-6 scroll-mt-6">
        <h3 className="mb-3 text-sm font-medium">Kandidaten</h3>
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
