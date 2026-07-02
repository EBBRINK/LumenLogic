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
  setPhaseAction,
} from "../actions";

export default async function DossierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
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
        </CardContent>
      </Card>
    </main>
  );
}
