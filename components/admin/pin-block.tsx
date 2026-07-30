"use client";

// PIN-blok van /admin/users (besluit G26, sprint 3.1 golf 2): Brink maakt hier een account
// en een tijdelijke activatie-PIN aan, ziet die PIN precies één keer, en krijgt een
// kopieerbaar mailsjabloon om zelf te versturen — de app verstuurt niets (besluit 6).
//
// "Eén keer zichtbaar" is hier geen belofte maar een eigenschap van de dataflow: de PIN
// bestaat alleen in de return-waarde van issuePinAction() (app/admin/users/actions.ts) en
// landt hieronder uitsluitend in React-state (`justIssued`). Er is geen enkel prop-pad van
// de server-component (app/admin/users/page.tsx) naar dit blok dat de klaartekst draagt —
// die pagina roept nooit issueActivationPin() aan, alleen getActivationPinStatus() (die de
// hash niet eens teruggeeft). Een echte pagina-refresh rendert page.tsx dus opnieuw vanaf
// nul en kan de PIN onmogelijk laten terugkomen; alleen React-navigatie binnen dezelfde
// tab-sessie behoudt `justIssued`, en dat is precies het venster waarin Brink hem overneemt.
//
// Await je issueAction vanuit dit client-component? Verplicht via callAction() uit
// lib/next-action-result.ts — requireSession() in de action redirect naar /login bij een
// verlopen sessie, en die rejection is geen fout maar Next' navigatiesignaal (zie dat bestand).
import { useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MembershipRole } from "@/db/schema";
import { callAction, failureDetail } from "@/lib/next-action-result";

export type OrgOption = { id: string; name: string; type: string };

export type PinState = "geen" | "actief" | "gebruikt" | "verlopen" | "geblokkeerd";

export type PinUserRow = {
  email: string;
  orgName: string | null;
  roles: string[];
  state: PinState;
  expiresAtIso: string | null;
  usedAtIso: string | null;
  attemptsLeft: number;
};

export type IssuePinResult =
  | {
      ok: true;
      email: string;
      pin: string;
      expiresAtIso: string;
      userCreated: boolean;
      activateUrl: string;
      name: string | null;
    }
  | { ok: false; error: string };

export type IssuePinAction = (input: {
  email: string;
  name?: string;
  orgId?: string | null;
  roles?: MembershipRole[];
}) => Promise<IssuePinResult>;

const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: "calculator", label: "Calculator" },
  { value: "werkvoorbereider", label: "Work preparer" },
  { value: "projectleider", label: "Project lead" },
  { value: "org_admin", label: "Org admin" },
];

const STATE_LABEL: Record<PinState, string> = {
  geen: "No PIN issued",
  actief: "Active",
  gebruikt: "Activated",
  verlopen: "Expired",
  geblokkeerd: "Locked (max attempts used)",
};

// Ronde-1-critic: de nadruk stond omgekeerd (de afgeronde 'gebruikt'-status kreeg de sterkste
// badge, de nog-te-behandelen 'actief'-status de zwakste) en 'verlopen'/'geblokkeerd' waren
// met hetzelfde destructive-vlak visueel niet te onderscheiden. Nu: 'actief' krijgt de
// sterkste (navy) nadruk — dát is de status die om actie vraagt — 'gebruikt' is rustig
// afgerond (secondary), en 'geblokkeerd' krijgt een eigen destructive-outline i.p.v. het
// volle destructive-vlak van 'verlopen', zodat de twee ook zonder de labeltekst uit elkaar
// te houden zijn (al is die labeltekst er sowieso — kleur is nooit het enige onderscheid).
const STATE_BADGE_VARIANT: Record<
  PinState,
  "default" | "secondary" | "outline" | "destructive"
> = {
  geen: "outline",
  actief: "default",
  gebruikt: "secondary",
  verlopen: "destructive",
  geblokkeerd: "outline",
};

const STATE_BADGE_CLASS: Partial<Record<PinState, string>> = {
  geblokkeerd: "border-destructive/60 text-destructive",
};

// Vaste tijdzone (i.p.v. de standaard, systeemafhankelijke zone): deze component is client-
// side, maar Next rendert hem ook server-side voor de eerste HTML (Vercel draait UTC, de
// browser Europe/Amsterdam). Zonder vaste zone renderen server en client verschillende
// datumteksten voor dezelfde ISO-waarde — een hydration-mismatch. Europe/Amsterdam is
// bovendien de zone waar Brink daadwerkelijk zit.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

// Het mailsjabloon dat Brink kopieert en zelf verstuurt (besluit G26). Ronde-1-critic gaf
// vijf punten mee: een klikbare, absolute link met het adres voorgevuld (?email=, gelezen
// door app/activate/page.tsx), het e-mailadres expliciet genoemd, de naam gebruikt als Brink
// die heeft ingevuld, afzender/context (Brink Licht) erbij, en "ignore" vervangen door een
// oproep om het te melden — een levende PIN negeren laat hem gewoon actief staan.
function pinTemplate({
  pin,
  expiresAtIso,
  activateUrl,
  email,
  name,
}: {
  pin: string;
  expiresAtIso: string;
  activateUrl: string;
  email: string;
  name: string | null;
}): string {
  return [
    "Subject: Your Lumen Logic account",
    "",
    `Hi ${name || "there"},`,
    "",
    `Brink Licht created your Lumen Logic account for ${email}.`,
    "Open the activation page and enter this one-time code to set your password:",
    "",
    activateUrl,
    "",
    pin,
    "",
    `Valid until ${formatDateTime(expiresAtIso)}. The code works once — it stops working after you set your password.`,
    "",
    "Didn't expect this? Let us know — don't ignore it, the code above stays active until it expires.",
  ].join("\n");
}

function CopyButton({
  text,
  label,
  copiedLabel = "Copied",
  variant = "default",
}: {
  text: string;
  label: string;
  copiedLabel?: string;
  variant?: "default" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  function onClick() {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Niet awaiten: de bevestiging mag niet aan clipboard-permissies hangen. Zonder
    // permissie (bv. onbeveiligde context) blijft de tekst gewoon zichtbaar en
    // selecteerbaar op het scherm — dat is de fallback.
    try {
      navigator.clipboard.writeText(text).catch(() => {});
    } catch {
      // Stil: de zichtbare, selecteerbare tekst is de fallback.
    }
  }
  return (
    // Bewust de standaardmaat (44px, h-11) — dit is het hero-moment van het scherm, geen
    // dichte toolbar, dus geen size="sm" (ronde-1-critic).
    <Button type="button" variant={variant} onClick={onClick}>
      {copied ? <Check /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}

export function PinBlock({
  organizations,
  users,
  issueAction,
  pinLength,
  pinTtlDays,
  pinMaxAttempts,
}: {
  organizations: OrgOption[];
  users: PinUserRow[];
  issueAction: IssuePinAction;
  pinLength: number;
  pinTtlDays: number;
  pinMaxAttempts: number;
}) {
  const [justIssued, setJustIssued] = useState<
    Extract<IssuePinResult, { ok: true }> | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reissuing, setReissuing] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Ronde-1-critic: het succespaneel verschijnt BOVEN de kaart met de knop die net is
  // ingedrukt — zonder deze focusverplaatsing blijft een toetsenbord-/schermlezergebruiker
  // (en de scrollpositie van een ziende gebruiker) simpelweg bij die knop hangen. Focus op
  // een element buiten beeld scrollt de browser er vanzelf naartoe.
  function focusPanel() {
    requestAnimationFrame(() => panelRef.current?.focus());
  }

  async function runIssue(input: {
    email: string;
    name?: string;
    orgId?: string | null;
    roles?: MembershipRole[];
  }): Promise<IssuePinResult> {
    const outcome = await callAction(() => issueAction(input), {
      path: "/admin/users",
    });
    if (outcome.kind === "signedOut") {
      return {
        ok: false,
        error: "Your session expired — no PIN was issued. Sign in again.",
      };
    }
    if (outcome.kind !== "value") {
      return {
        ok: false,
        error:
          outcome.kind === "failed"
            ? `Could not issue a PIN (${failureDetail(outcome.error)}).`
            : `Issuing the PIN ended on an unexpected page (${outcome.href}).`,
      };
    }
    return outcome.value;
  }

  async function onCreateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim();
    const orgId = String(fd.get("orgId") ?? "").trim() || null;
    const roles = fd.getAll("roles").map(String) as MembershipRole[];
    if (!email) {
      setFormError("Enter an email address.");
      return;
    }
    setSubmitting(true);
    setJustIssued(null);
    try {
      const result = await runIssue({
        email,
        name: name || undefined,
        orgId,
        roles,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setJustIssued(result);
      form.reset();
      focusPanel();
    } finally {
      setSubmitting(false);
    }
  }

  async function onReissue(email: string) {
    setFormError(null);
    setReissuing(email);
    setJustIssued(null);
    try {
      const result = await runIssue({ email });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setJustIssued(result);
      focusPanel();
    } finally {
      setReissuing(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {justIssued && (
        // tabIndex + role="status": het belangrijkste moment van het scherm krijgt
        // expliciet aandacht (focus + live-region), in plaats van stil boven de zojuist
        // ingedrukte knop te verschijnen (ronde-1-critic).
        <div
          ref={panelRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          data-testid="pin-issued-panel"
          className="rounded-xl outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Card className="border-2 border-ring">
            <CardHeader data-testid="pin-issued-header">
              <CardTitle>PIN for {justIssued.email}</CardTitle>
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  You can only see this once. Copy it now — after you leave
                  or refresh this page, it is gone for good.
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div data-testid="pin-issued-code">
                <p className="mb-1.5 text-sm font-medium">One-time PIN</p>
                <p
                  data-testid="pin-value"
                  className="w-full select-all rounded-lg border border-input bg-muted px-4 py-3 text-center text-4xl font-semibold tabular-nums tracking-[0.35em]"
                >
                  {justIssued.pin}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <CopyButton text={justIssued.pin} label="Copy PIN" />
                  <span className="text-sm text-muted-foreground">
                    Valid until {formatDateTime(justIssued.expiresAtIso)} ·{" "}
                    {justIssued.userCreated
                      ? "new account created"
                      : "existing account"}
                  </span>
                </div>
              </div>

              <div data-testid="pin-issued-template">
                <p className="mb-1.5 text-sm font-medium">Email template</p>
                <textarea
                  readOnly
                  aria-label="Email template for the user"
                  value={pinTemplate(justIssued)}
                  // Dynamisch i.p.v. een vaste rows-waarde: het sjabloon groeit met de naam-
                  // en linklengte, en op een smalle 375px-textarea wrapt elke zin verder dan
                  // op desktop. Ronde-1-critic ving een vaste rows={9} die op elke viewport
                  // afsneed. +10 is ruim: bij 14 logische regels dekt dat de extra
                  // wrap-regels die de langste zinnen op mobiel geven (zelf nagemeten).
                  rows={Math.min(
                    28,
                    pinTemplate(justIssued).split("\n").length + 10,
                  )}
                  className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm leading-relaxed text-foreground"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <CopyButton
                    text={pinTemplate(justIssued)}
                    label="Copy email text"
                    variant="secondary"
                  />
                  <span className="text-xs text-muted-foreground">
                    Paste this into your own mailbox and send it to{" "}
                    {justIssued.email} — Lumen Logic does not send this email
                    for you.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issue a PIN</CardTitle>
          <p className="text-sm text-muted-foreground">
            Creates the account if it doesn&apos;t exist yet and gives it a{" "}
            {pinLength}-digit PIN, valid for {pinTtlDays} days with{" "}
            {pinMaxAttempts} attempts. You email it yourself — the template
            appears above once it&apos;s issued. Issuing again always
            replaces any PIN this address already has, valid or expired —
            that&apos;s also how a forgotten password is solved.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pin-email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="pin-email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pin-name" className="text-sm font-medium">
                  Name{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <Input
                  id="pin-name"
                  name="name"
                  placeholder="Used in the email greeting"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pin-org" className="text-sm font-medium">
                Organization
              </label>
              {/* Verplicht (ronde-1-critic): zonder organisatie krijgt de nieuwe user geen
                  membership en duikt hij dus niet op in de statuslijst hieronder, die op
                  memberships leunt — "vergeten = nieuwe PIN" (C10) werkt dan niet meer voor
                  dat account. Elke echte gebruiker hoort sowieso bij een org (G31): Brink
                  zelf is de 'intern'-org, elke klant een 'extern'-org. */}
              <select
                id="pin-org"
                name="orgId"
                required
                defaultValue=""
                className="h-11 w-full rounded-lg border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/10 sm:max-w-sm"
              >
                <option value="" disabled>
                  Choose an organization
                </option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.type})
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Roles</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {ROLE_OPTIONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="roles"
                      value={r.value}
                      className="size-4 rounded border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? "Issuing…" : "Create account & issue PIN"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card data-testid="pin-status-card">
        <CardHeader>
          <CardTitle>PIN status</CardTitle>
          <p className="text-sm text-muted-foreground">
            The PIN itself is never shown again after it&apos;s issued — only
            its status.
          </p>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-foreground/10">
              {users.map((u) => (
                <li
                  key={u.email}
                  // Ronde-1-critic, grootste zwakte: dit stond op één `flex flex-wrap
                  // justify-between`-rij. Zodra het rechterblok niet meer naast het
                  // e-mailadres paste, wrapte het naar een eigen regel, en met maar één
                  // element op die regel zet `justify-content: space-between` het blok
                  // linksaf i.p.v. rechts — vandaar dat elke statusrij op een andere
                  // x-positie belandde. Nu: op mobiel expliciet twee eigen rijen
                  // (flex-col), waarbij rij 2 zélf weer een justify-between-rij is (badge
                  // links, knop rechts) — geen enkele child hoeft nog te wrappen, dus geen
                  // enkele rij kan meer "toevallig" ergens anders landen.
                  className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 sm:flex-1">
                    <p className="truncate font-medium">{u.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.orgName || "no organization"}
                      {u.roles.length > 0 ? ` · ${u.roles.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left">
                      <Badge
                        variant={STATE_BADGE_VARIANT[u.state]}
                        className={STATE_BADGE_CLASS[u.state]}
                      >
                        {STATE_LABEL[u.state]}
                      </Badge>
                      {/* Twee losse regels i.p.v. één met een "·"-koppelteken: die ene
                          regel brak op smalle schermen midden in de zin ("… 4 attempts" /
                          "left" op de volgende regel) — een weeswoord, geen bewuste
                          afbreking (ronde-1-critic). */}
                      {(u.state === "actief" || u.state === "geblokkeerd") &&
                        u.expiresAtIso && (
                          <>
                            <p className="mt-1 text-xs text-muted-foreground">
                              until {formatDateTime(u.expiresAtIso)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {u.attemptsLeft} attempts left
                            </p>
                          </>
                        )}
                      {u.state === "gebruikt" && u.usedAtIso && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          activated {formatDateTime(u.usedAtIso)}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={reissuing === u.email}
                      title="Issuing a new PIN replaces the current one, valid or expired."
                      onClick={() => onReissue(u.email)}
                    >
                      {reissuing === u.email
                        ? "Issuing…"
                        : u.state === "geen"
                          ? "Issue PIN"
                          : "Issue new PIN"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
