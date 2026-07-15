import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { AnalyticsView } from "@/components/analytics-view";
import { getAnalytics } from "@/lib/repo/analytics";
import { requireSession } from "@/lib/session";

export default async function AnalyticsPage() {
  await requireSession();
  const data = await getAnalytics(db);
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Projects
      </Link>
      <AnalyticsView data={data} />
    </main>
  );
}
