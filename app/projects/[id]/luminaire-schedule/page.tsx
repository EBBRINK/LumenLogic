import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { ArmaturenboekView } from "@/components/dossier/armaturenboek-view";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { requireUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";
import { PrintButton } from "./print-button";

// Armaturenboek-tab (§3.10): overdrachtsdocument voor de bouwplaats. De dossier-layout
// levert al de kop (naam, klant, fase, telling) + tabs — deze pagina rendert alleen zijn
// eigen inhoud als fragment. Elke spec-regel komt terug, ook de onopgeloste (niet weglaten).
export default async function ArmaturenboekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  // Eigen guard, niet die van de dossier-layout: die rendert concurrent met deze pagina,
  // dus wie het eerst gooit bepaalt het antwoord. Zie de regel bij requireUuid in
  // lib/uuid.ts.
  requireUuid(id);
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const lines = await getSpecLines(db, id);

  return (
    <>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <ArmaturenboekView
        dossierName={dossier.name}
        customer={dossier.customer}
        phase={dossier.phase}
        rows={lines.map((l) => ({
          fixtureCode: l.fixtureCode,
          quantity: l.quantity,
          brand: l.matchedBrand ?? l.brandText,
          productName: l.matchedName,
          articleCode: l.matchedArticleCode,
          kelvin: l.matchedKelvin ?? l.reqKelvin,
          cri: l.matchedCri ?? l.reqCri,
          ip: l.matchedIp ?? l.reqIp,
          status: l.status,
        }))}
      />
    </>
  );
}
