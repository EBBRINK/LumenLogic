import { db } from "@/db/client";
import {
  UploadReviewBlock,
  type UploadReviewRow,
} from "@/components/admin/upload-review-block";
import { listBrandUploadsForReview, listBrandsWithTier } from "@/lib/repo/admin";
import { requireSession } from "@/lib/session";
import {
  approveUploadAction,
  pdlImportAction,
  rejectUploadAction,
} from "../actions";

// MERK-UPLOADS goedkeuren/afwijzen + PDL-import-stub (§3.16, H-10/H-11). Eigen <main>.
export default async function AdminImportsPage() {
  await requireSession();

  const [uploads, brands] = await Promise.all([
    listBrandUploadsForReview(db),
    listBrandsWithTier(db),
  ]);

  const rows: UploadReviewRow[] = uploads.map((u) => ({
    id: u.id,
    brandName: u.brandName ?? null,
    kind: u.kind,
    submittedBy: u.submittedBy ?? null,
    createdAt:
      u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : String(u.createdAt),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Imports</h1>
        <p className="text-sm text-muted-foreground">
          Merk-uploads in staging goedkeuren of afwijzen, en de PDL-import.
        </p>
      </header>
      <UploadReviewBlock
        uploads={rows}
        pdlBrands={brands.map((b) => ({ id: b.id, name: b.name }))}
        approveAction={approveUploadAction}
        rejectAction={rejectUploadAction}
        pdlImportAction={pdlImportAction}
      />
    </main>
  );
}
