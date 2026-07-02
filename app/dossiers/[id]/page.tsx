import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { db } from "@/db/client";
import { AddSpecLineForm } from "@/components/dossier/add-spec-line-form";
import { PhaseBadge } from "@/components/dossier/phase-badge";
import { SpecLineTable } from "@/components/dossier/spec-line-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { requireSession } from "@/lib/session";
import {
  addSpecCsvAction,
  addSpecLineAction,
  deleteLineAction,
  generateQuoteAction,
  importArmaturenboekPdfAction,
  setPhaseAction,
} from "../actions";

export default async function DossierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { pdf } = await searchParams;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const lines = await getSpecLines(db, id);
  const matchedCount = lines.filter((l) => l.status === "matched").length;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link
        href="/dossiers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Dossiers
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {dossier.name}
            </h1>
            <PhaseBadge phase={dossier.phase} />
          </div>
          {dossier.customer && (
            <p className="text-sm text-muted-foreground">{dossier.customer}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <form action={setPhaseAction} className="flex items-center gap-1.5">
            <input type="hidden" name="dossierId" value={dossier.id} />
            <select
              name="phase"
              defaultValue={dossier.phase}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
            >
              <option value="tender">Tender</option>
              <option value="awarded">Gegund</option>
            </select>
            <Button type="submit" variant="outline" size="sm">
              Fase bijwerken
            </Button>
          </form>
          <form action={generateQuoteAction}>
            <input type="hidden" name="dossierId" value={dossier.id} />
            <Button type="submit" size="sm">
              <FileText /> Genereer offerte
            </Button>
          </form>
        </div>
      </header>

      <nav className="mb-8 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/dossiers/${dossier.id}/offerte`}>Offerte (calculator)</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/dossiers/${dossier.id}/werkvoorbereiding`}>
            Werkvoorbereiding{dossier.phase === "tender" ? " (gegund)" : ""}
          </Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/dossiers/${dossier.id}/armaturenboek`}>
            Armaturenboek (projectleider)
          </Link>
        </Button>
      </nav>

      {pdf && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          {pdf === "geen-tekstlaag" ? (
            <>
              De PDF bevat geen tekstlaag (waarschijnlijk als beeld geëxporteerd) —
              er viel niets te importeren. Gebruik een tekst-PDF of het CSV-blok.
            </>
          ) : (
            <>
              <span className="font-medium">{pdf}</span> spec-regels uit de PDF
              geïmporteerd.
            </>
          )}
        </div>
      )}

      <section className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Spec-regels</h2>
          <p className="text-sm text-muted-foreground">
            {matchedCount}/{lines.length} gematcht
          </p>
        </div>
        <SpecLineTable
          dossierId={dossier.id}
          lines={lines}
          deleteAction={deleteLineAction}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Spec-regels toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSpecLineForm
            dossierId={dossier.id}
            addLineAction={addSpecLineAction}
            addCsvAction={addSpecCsvAction}
          />
          <form
            action={importArmaturenboekPdfAction}
            className="mt-6 flex flex-wrap items-center gap-3 border-t pt-6"
          >
            <input type="hidden" name="dossierId" value={dossier.id} />
            <div>
              <p className="text-sm font-medium">Armaturenboek-PDF importeren</p>
              <p className="text-xs text-muted-foreground">
                Leest de inhoudsopgave (code · merk · type). Alleen PDF&apos;s met
                tekstlaag.
              </p>
            </div>
            <input
              type="file"
              name="pdf"
              accept="application/pdf"
              required
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
            />
            <Button type="submit" variant="secondary" size="sm">
              Importeer PDF
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
