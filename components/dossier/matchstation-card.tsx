// Sprint M1 (docs/plan-matchstation-eigen-machine.md) — intern-only kaart op de
// projectpagina: dossier in de wachtrij zetten voor het matchstation, of de huidige
// stand tonen. Uitgelicht als eigen component (zoals PdfUploadCard, AddSpecLineForm)
// zodat hij los te screenshot-testen is — zie matchstation-card.test.tsx.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type MatchstationQueueEntry = {
  status: string;
  enqueuedAt: Date;
  leaseUntil: Date | null;
  resultReceivedAt: Date | null;
};

export function MatchstationCard({
  dossierId,
  entry,
  enqueueAction,
}: {
  dossierId: string;
  entry: MatchstationQueueEntry | null;
  enqueueAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Matchstation</CardTitle>
      </CardHeader>
      <CardContent>
        {entry == null && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              Not queued for the matchstation yet.
            </p>
            <form action={enqueueAction}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <Button type="submit" variant="outline" size="sm">
                Ready for matching
              </Button>
            </form>
          </>
        )}
        {entry?.status === "wachtend" && (
          <p className="text-sm text-muted-foreground">
            Queued for the matchstation since {entry.enqueuedAt.toLocaleString()}.
          </p>
        )}
        {entry?.status === "geclaimd" && (
          <p className="text-sm text-muted-foreground">
            Claimed by the matchstation, lease until{" "}
            {entry.leaseUntil?.toLocaleString()}.
          </p>
        )}
        {entry?.status === "verwerkt" && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              Processed by the matchstation on{" "}
              {entry.resultReceivedAt?.toLocaleString()}.
            </p>
            <form action={enqueueAction}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <Button type="submit" variant="outline" size="sm">
                Send again
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
