import { db } from "@/db/client";
import { adminCards, AdminCards } from "@/components/admin/admin-cards";
import {
  listAllMemberships,
  listBrandUploadsForReview,
  listBrandsWithTier,
} from "@/lib/repo/admin";
import { listBrandLoadQueue } from "@/lib/repo/enrichment";
import { listEigenVelden } from "@/lib/repo/custom-fields";
import { bewaakRoute } from "@/lib/route-toegang";

// ADMIN-CONSOLE OVERZICHT (§3.16, H3): de beheerhoeken met een telling en een pad erheen.
// Eigen <main> (buiten de dossier-layout). Sprint 2.0a: Activity verhuisde naar
// /admin/event-log — Admin toont alleen nog wat beheerhandelingen zijn.
//
// IA-opschoning 12 aug 2026: de Data-werkbank is opgeheven. Wat daar aan BEHEER stond,
// staat sindsdien hier — velden, event log, inlaadwachtrij en de matcher-evaluatie. Wat
// aan een mérk hangt (prijslijsten) ging naar /brand-management, en het
// verrijkings-steekproefscherm is helemaal verdwenen: die vragen stelt de
// prijslijst-skill nu in de chat.
export default async function AdminOverviewPage() {
  await bewaakRoute("/admin");

  const [brands, uploads, memberships, fields, queue] = await Promise.all([
    listBrandsWithTier(db),
    listBrandUploadsForReview(db),
    listAllMemberships(db),
    listEigenVelden(db),
    listBrandLoadQueue(db),
  ]);

  const wachtend = queue.filter((q) => q.status === "wachtend").length;

  const cards = adminCards({
    brands: brands.length,
    uploads: uploads.length,
    memberships: memberships.length,
    fields: fields.length,
    waiting: wachtend,
  });

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Brink admin: brands, uploads, organizations and the catalog
          workbench.
        </p>
      </header>

      <AdminCards cards={cards} />
    </main>
  );
}
