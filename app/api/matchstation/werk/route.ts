// Sprint M1 (docs/plan-matchstation-eigen-machine.md) — het ophaal-endpoint: geeft het
// oudste onclaimde dossier + de beste beschikbare documentreconstructie terug, en claimt
// het dossier meteen (nooit twee machines op hetzelfde dossier — zie claimNextDossier).
//
// Machine-auth, geen mensensessie: staat als "open" in lib/route-allowlist.ts, net als
// /api/health — bewaakRoute() is hier bewust NIET aangeroepen (de allowlist-test eist
// dat alleen van NIET-open routes; open routes bewaken zichzelf, zoals /api/health al
// deed). De echte poort is verifyMachineKey hieronder.
//
// Elke aanroep die de sleutelcheck haalt is een heartbeat (M1-eis 3), ongeacht of er
// werk is — dat is óók de "staat de pc aan"-check uit het plandocument.
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";
import {
  claimNextDossier,
  getDocumentForDossier,
  getDossierForMatchstation,
  getExistingLinesForMatching,
  registerHeartbeat,
} from "@/lib/repo/matchstation";
import { verifyMachineKey } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyMachineKey(request.headers.get("x-matchstation-key"));
  if (!auth.ok) {
    // Ijzeren regel 5: ook een geweigerde poging is een gebeurtenis. De reden staat
    // hier voluit; de aanroeper krijgt alleen "unauthorized" terug (zelfde les als
    // MSG_DENIED in lib/repo/authz.ts — een 401 met uitleg vertelt een aanvaller wat
    // hij moet raden).
    await logEvent(db, {
      entity: "matchstation",
      action: "matchstation_auth_denied",
      payload: { reason: auth.reason, route: "werk" },
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await registerHeartbeat(db);

  const claim = await claimNextDossier(db);
  if (!claim) return new Response(null, { status: 204 });

  const [dossier, existingLines, document] = await Promise.all([
    getDossierForMatchstation(db, claim.dossierId),
    getExistingLinesForMatching(db, claim.dossierId),
    getDocumentForDossier(db, claim.dossierId),
  ]);

  return Response.json({
    job: {
      queueId: claim.id,
      dossierId: claim.dossierId,
      claimedAt: claim.claimedAt.toISOString(),
      leaseUntil: claim.leaseUntil.toISOString(),
    },
    dossier,
    existingLines,
    document: {
      importRunId: document.importRunId,
      filename: document.filename,
      markdown: document.markdown,
      pageImages: document.pageImages.map((p) => ({
        ...p,
        url: `/api/matchstation/document/${document.importRunId}/${p.page}/${p.tile}`,
      })),
      warning: document.warning,
    },
  });
}
