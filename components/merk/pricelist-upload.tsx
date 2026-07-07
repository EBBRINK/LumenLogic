import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Prijslijst aanleveren (H-11): één publicatiepad. De aanlevering gaat naar 'staging' en
// wacht op goedkeuring — er is geen directe weg naar de catalogus. valid_until is VERPLICHT:
// een prijslijst zonder einddatum voedt ijzeren regel 3 niet en wordt geweigerd.
export type UploadRow = {
  id: string;
  kind: string;
  status: "staging" | "approved" | "rejected";
  validUntil: string | null;
  submittedBy: string | null;
  createdAt: string;
};

const statusLabel: Record<UploadRow["status"], string> = {
  staging: "In afwachting van controle",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

function statusVariant(
  status: UploadRow["status"],
): "secondary" | "default" | "destructive" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

export function PricelistUpload({
  brandId,
  brandName,
  uploads,
  submitAction,
}: {
  brandId: string;
  brandName: string;
  uploads: UploadRow[];
  submitAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nieuwe prijslijst</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lever een prijslijst voor {brandName} aan. Een einddatum (geldig tot) is
            verplicht — zonder einddatum wordt de lijst niet aangenomen.
          </p>
        </CardHeader>
        <CardContent>
          <form action={submitAction} className="flex flex-col gap-4">
            <input type="hidden" name="brandId" value={brandId} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="valid-until" className="text-sm font-medium">
                Geldig tot
              </label>
              <Input
                id="valid-until"
                name="validUntil"
                type="date"
                required
                className="sm:max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Verplicht. Na deze datum vervalt de prijslijst automatisch.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pricelist-name" className="text-sm font-medium">
                Omschrijving
              </label>
              <Input
                id="pricelist-name"
                name="name"
                placeholder="bv. Prijslijst 2027 Q1"
                className="sm:max-w-xs"
              />
            </div>
            <Button type="submit" className="self-start">
              Aanleveren ter controle
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Aangeleverd</h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog niets aangeleverd.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {uploads.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.kind === "pricelist" ? "Prijslijst" : "Data"}
                    {u.validUntil ? ` — geldig tot ${u.validUntil}` : ""}
                  </p>
                  {u.submittedBy && (
                    <p className="truncate text-xs text-muted-foreground">
                      aangeleverd door {u.submittedBy}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant(u.status)}>
                  {statusLabel[u.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
