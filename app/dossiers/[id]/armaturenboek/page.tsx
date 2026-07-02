import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { ArmaturenboekView } from "@/components/dossier/armaturenboek-view";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { requireSession } from "@/lib/session";

export default async function ArmaturenboekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const lines = await getSpecLines(db, id);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 print:hidden">
        <Link
          href={`/dossiers/${dossier.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {dossier.name}
        </Link>
      </div>
      <ArmaturenboekView
        dossierName={dossier.name}
        customer={dossier.customer}
        phase={dossier.phase}
        rows={lines.map((l) => ({
          fixtureCode: l.fixtureCode,
          quantity: l.quantity,
          brand: l.matchedBrand,
          productName: l.matchedName,
          articleCode: l.matchedArticleCode,
          kelvin: l.matchedKelvin,
          cri: l.matchedCri,
          ip: l.matchedIp,
          status: l.status,
        }))}
      />
    </main>
  );
}
