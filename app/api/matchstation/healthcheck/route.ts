// Sprint M1-eis 3 — de actieve dood-melding (Henk's review, "zonder dit niet live").
// Een uitgeschakelde of hangende machine poll niet meer, dus niets in het ophaal-
// endpoint kan dat zelf signaleren; dit endpoint moet daarom door IETS ANDERS worden
// aangeroepen — een Vercel Cron (zie vercel.json). Vercel stuurt bij een geconfigureerde
// CRON_SECRET automatisch `Authorization: Bearer $CRON_SECRET` mee; dat verifiëren we
// hier, dezelfde vorm als de machine-sleutel op de andere twee endpoints.
//
// "open" in lib/route-allowlist.ts, zelfde reden als /api/health: geen mensensessie,
// eigen poort.
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";
import { findDeadAlerts, sendDeadAlert } from "@/lib/repo/matchstation";
import { verifyCronSecret } from "@/lib/machine-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyCronSecret(request.headers.get("authorization"));
  if (!auth.ok) {
    await logEvent(db, {
      entity: "matchstation",
      action: "matchstation_auth_denied",
      payload: { reason: auth.reason, route: "healthcheck" },
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const alerts = await findDeadAlerts(db);
  for (const alert of alerts) {
    await sendDeadAlert(db, alert);
  }

  return Response.json({ alerted: alerts.length });
}
