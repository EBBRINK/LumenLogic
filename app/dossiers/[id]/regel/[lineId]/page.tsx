import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { MatchCandidates } from "@/components/dossier/match-candidates";
import { getDossier, getSpecLine } from "@/lib/repo/dossiers";
import {
  getAlternativeSuggestions,
  searchProducts,
} from "@/lib/repo/products";
import { getActor, requireSession } from "@/lib/session";
import { matchAction, noMatchAction } from "../../../actions";

export default async function MatchPage({
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
  if (!dossier || !specLine) notFound();

  const candidates = await searchProducts(db, {
    query: specLine.productText ?? specLine.fixtureCode,
    brand: specLine.brandText,
    limit: 8,
    actor: await getActor(),
    specLineId: specLine.id,
  });

  // Regel 4: in tender levert dit altijd []; alleen in gegund kán er iets komen (run 3).
  const suggestions = specLine.matchedProductId
    ? await getAlternativeSuggestions(db, {
        phase: dossier.phase,
        productId: specLine.matchedProductId,
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link
        href={`/dossiers/${dossier.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {dossier.name}
      </Link>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Match voor {specLine.fixtureCode}
        </h1>
        <p className="text-sm text-muted-foreground">
          Gevraagd: <span className="font-medium">{specLine.brandText}</span>{" "}
          {specLine.productText} · {specLine.quantity} stuks
        </p>
      </header>

      <MatchCandidates
        dossierId={dossier.id}
        specLine={{
          id: specLine.id,
          fixtureCode: specLine.fixtureCode,
          brandText: specLine.brandText,
          productText: specLine.productText,
        }}
        candidates={candidates}
        phase={dossier.phase}
        suggestions={suggestions}
        matchAction={matchAction}
        noMatchAction={noMatchAction}
      />
    </main>
  );
}
