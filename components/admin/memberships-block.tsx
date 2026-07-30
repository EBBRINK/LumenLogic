import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type MembershipRow = {
  id: string;
  orgName: string;
  email: string;
  roles: string[]; // 'calculator' | 'werkvoorbereider' | 'projectleider' | 'org_admin'
};

const ROLE_LABEL: Record<string, string> = {
  calculator: "Calculator",
  werkvoorbereider: "Work preparer",
  projectleider: "Project lead",
  org_admin: "Org admin",
};

// GEBRUIKERS OVER ORGS (§3.16, L-03/04): de admin ziet leden over org-grenzen. Rollen zijn
// "petten" — meerdere per persoon. De rol bepaalt de default-landing, nooit wat de engine
// toont (dat is de fase). Alleen-lezen inzage hier; leden beheren doet de org-admin zelf.
export function MembershipsBlock({
  memberships,
}: {
  memberships: MembershipRow[];
}) {
  return (
    <Card>
      {/* Geen eigen kop meer (UX-audit 30 jul, bug #10): de paginakop zei letterlijk
          hetzelfde, één regel hoger. De beleidszin staat nu daar. */}
      <CardContent className="pt-6">
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No members in any organization yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.orgName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {m.roles.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          no role
                        </span>
                      ) : (
                        m.roles.map((r) => (
                          <Badge key={r} variant="secondary">
                            {ROLE_LABEL[r] ?? r}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
