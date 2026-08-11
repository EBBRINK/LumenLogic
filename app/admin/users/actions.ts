"use server";

// PIN uitgeven vanuit /admin/users (besluit G26): Brink maakt hier een account plus een
// tijdelijke activatie-PIN aan en mailt die PIN zélf — de app verstuurt niets. Deze action
// is de enige plek waar de klaartekst-PIN ontstaat: hij komt terug in de return-waarde van
// deze ene aanroep, wordt nergens gelogd (issueActivationPin logt alleen e-mail/org/vervaldatum,
// zie lib/repo/activation.ts) en bestaat verder alleen nog gehasht in de database. Zie
// components/admin/pin-block.tsx voor hoe de client die waarde behandelt: uitsluitend in
// React-state, nooit in een prop die van de server komt — een pagina-refresh (nieuwe RSC-render
// van page.tsx) roept deze action niet aan en kan de PIN dus nooit opnieuw tonen.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import type { MembershipRole } from "@/db/schema";
import {
  createOrgAndIssuePinAsActor,
  createOrgAsActor,
  issuePinAsActor,
  setSeatLimitAsActor,
} from "@/lib/repo/authz";
import { bewaakNiveau, bewaakRoute } from "@/lib/route-toegang";

export type IssuePinResult =
  | {
      ok: true;
      email: string;
      /** Klaartekst. Bestaat exact één keer — zie het bestandscommentaar hierboven. */
      pin: string;
      expiresAtIso: string;
      userCreated: boolean;
      /** Absoluut, met ?email= voorgevuld (app/activate/page.tsx leest die param). */
      activateUrl: string;
      name: string | null;
      /**
       * De rollen zoals ze in de database staan. Kan één rol méér bevatten dan aangevinkt:
       * de eerste persoon in een organisatie wordt haar org_admin (G36, eerste zin). Het
       * scherm toont ze, zodat een toegekende beheerdersrol nooit onzichtbaar blijft.
       *
       * Dit is een gelijkheid, geen benadering: zonder organisatie wordt er géén membership
       * geschreven, en dan weigert de autorisatielaag de uitgifte in plaats van de rollen
       * stil te laten vallen (`rollen_zonder_org` in lib/repo/authz.ts). Bij een herhaalde
       * uitgifte voor een bestaand lid staat hier `[]` — het bestaande membership blijft
       * dan ongemoeid, dus er is niets toegekend.
       */
      roles: MembershipRole[];
      /**
       * De naam van de organisatie die in dezelfde handeling is aangemaakt (besluit 4b),
       * of `null` bij een bestaande organisatie. Het scherm noemt hem in het succespaneel:
       * wie in één klik twee dingen doet, hoort te zien dat er twee dingen zijn gebeurd.
       */
      orgCreated: string | null;
    }
  | { ok: false; error: string };

// Ronde-1-critic: "/activate zonder domein is onbruikbaar" — de ontvanger kan een relatief
// pad niet klikken of intypen. De host komt uit de INKOMENDE request van deze server-action
// (x-forwarded-host op Vercel, host lokaal), dus dit klopt vanzelf in elke omgeving
// (localhost, preview-deploy, productie) zonder dat deze laag een productie-URL hoeft te
// raden of te hardcoden.
async function buildActivateUrl(email: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return `/activate?email=${encodeURIComponent(email)}`;
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/activate?email=${encodeURIComponent(email)}`;
}

// Ronde-1-critic: "rauwe interne foutteksten in de UI" — issueActivationPin gooit Nederlands
// mét functienaam ("issueActivationPin: onbekende organisatie"), en elke andere DB-fout kwam
// woordelijk op het Engelse scherm terecht. Sinds G36 komen de bekende gevallen (vormloos
// adres, verdwenen organisatie, "jij mag dit niet") al als Engelse, lekvrije tekst uit
// authorizePinIssue(); wat hier nog langskomt is een échte storing — nooit err.message
// doorgeven.
function friendlyIssueError(): string {
  return "Something went wrong while issuing the PIN. Check the events log, or try again.";
}

// Dekt zowel "nieuwe gebruiker aanmaken" (met org + rollen) als "PIN opnieuw uitgeven voor
// een bestaande gebruiker" (orgId/roles dan weggelaten door de aanroeper — issueActivationPin
// laat een bestaand membership dan ongemoeid en overschrijft alleen de PIN, precies C10's
// "wachtwoord vergeten = nieuwe PIN"). Client-aanroepers gebruiken callAction() uit
// lib/next-action-result.ts: requireSession() hieronder redirect naar /login bij een
// verlopen sessie, en dat kanaal draagt dan zowel succes als "je bent uitgelogd".
export async function issuePinAction(input: {
  email: string;
  name?: string;
  orgId?: string | null;
  roles?: MembershipRole[];
  /**
   * Besluit 4b (Timo, 4 aug): in ÉÉN handeling een organisatie aanmaken én de PIN uitgeven.
   * Aanwezig = "maak deze organisatie", en dan telt `orgId` niet mee. Alles-of-niets: gaat
   * de PIN mis, dan bestaat de organisatie ook niet (besluit 5, uitgevoerd in
   * `createOrgAndIssuePinAsActor`).
   */
  newOrg?: { name: string; plan?: string; seatLimit?: number };
}): Promise<IssuePinResult> {
  const toegang = await bewaakRoute("/admin/users");
  const name = input.name?.trim() || null;

  try {
    if (input.newOrg) {
      // ⚠️ Geen `bewaakNiveau("intern")` hier: dat zou de regel op twee plekken zetten.
      // `createOrgAndIssuePinAsActor` weigert een niet-interne actor zelf (besluit 2), leidt
      // die bevoegdheid vers uit de database af en logt de weigering — zelfde vorm als G39.
      const uitkomst = await createOrgAndIssuePinAsActor(db, {
        actorEmail: toegang.email,
        orgName: input.newOrg.name,
        plan: input.newOrg.plan,
        seatLimit: input.newOrg.seatLimit,
        email: input.email,
        name: name ?? undefined,
        roles: input.roles,
      });
      if (!uitkomst.ok) return { ok: false, error: uitkomst.message };
      revalidatePath("/admin/users");
      return {
        ok: true,
        email: uitkomst.issued.email,
        pin: uitkomst.issued.pin,
        expiresAtIso: uitkomst.issued.expiresAt.toISOString(),
        userCreated: uitkomst.issued.userCreated,
        activateUrl: await buildActivateUrl(uitkomst.issued.email),
        name,
        roles: uitkomst.roles,
        orgCreated: uitkomst.org.name,
      };
    }

    // Besluiten G36/G39 — de enige poort. Deze action beslist zelf niets en draagt ook geen
    // toestemming: hij geeft door wíé het vraagt (uit de sessie, niet uit de invoer) en wát
    // er gevraagd wordt. issuePinAsActor zoekt de rechten van die actor vers op en schrijft
    // in dezelfde aanroep. Er is hier bewust geen `if` over rollen of organisaties: dan
    // zouden er twee plekken zijn waar G36 staat, die uit elkaar kunnen lopen.
    //
    // De hele aanroep staat binnen de try: een vormloze orgId of een databasestoring hoort
    // dezelfde nette `{ok:false}` te geven als een weigering, niet een harde error op de
    // client — en zeker geen ander gedrag voor een onbevoegde dan voor een bevoegde.
    const outcome = await issuePinAsActor(db, {
      actorEmail: toegang.email,
      email: input.email,
      name: name ?? undefined,
      orgId: input.orgId ?? null,
      roles: input.roles,
    });
    if (!outcome.ok) return { ok: false, error: outcome.message };

    // Ververst de PIN-statuslijst en de memberships-tabel op deze pagina (nieuwe org-lid,
    // nieuwe vervaldatum, teller terug op 0). Draagt zelf nooit de PIN — die staat alleen
    // in de return hieronder, die rechtstreeks naar de aanroepende client gaat.
    revalidatePath("/admin/users");
    return {
      ok: true,
      email: outcome.issued.email,
      pin: outcome.issued.pin,
      expiresAtIso: outcome.issued.expiresAt.toISOString(),
      userCreated: outcome.issued.userCreated,
      activateUrl: await buildActivateUrl(outcome.issued.email),
      name,
      roles: outcome.roles,
      orgCreated: null,
    };
  } catch {
    return { ok: false, error: friendlyIssueError() };
  }
}

// ── Organisatiebeheer (sprint 3.2c, besluiten 1/2/4a/6/7) ──────────────────────
//
// Deze twee actions komen van `/settings/organization` en horen sinds 3.2c hier: iemand
// toegang geven is in het hoofd van Brink één handeling, en die stond over twee schermen
// verdeeld. Het aanmaakformulier is dáár weggehaald in plaats van gedupliceerd — twee
// plekken laten bestaan verdubbelt de versnippering in plaats van hem op te lossen.

export type OrgResult = { ok: true } | { ok: false; error: string };

/**
 * Besluit 4a: een organisatie los aanmaken, zonder meteen iemand uit te nodigen — om alvast
 * klaar te zetten. De één-klik-variant (4b) loopt via `issuePinAction({ newOrg })`.
 *
 * Er is geen intern/extern-keuze, hier niet en nergens (besluit 3): `createOrganization()`
 * zet 'extern', altijd. `bewaakNiveau("intern")` staat er als eerste poort — de action zit
 * op een route die op `org_admin` staat, dus zonder deze regel zou een externe beheerder
 * hem kunnen aanroepen. `createOrgAsActor` weigert hem daarna nóg een keer, en dát is de
 * regel; deze poort is de goedkope voorkant.
 */
export async function createOrgAction(input: {
  name: string;
  plan?: string;
  seatLimit?: number;
}): Promise<OrgResult> {
  const toegang = await bewaakNiveau("intern", "createOrgAction");
  try {
    const uitkomst = await createOrgAsActor(db, {
      actorEmail: toegang.email,
      name: input.name,
      plan: input.plan,
      seatLimit: input.seatLimit,
    });
    if (!uitkomst.ok) return { ok: false, error: uitkomst.message };
    revalidatePath("/admin/users");
    // De organisatielijst op het organisatiescherm verandert hier ook van.
    revalidatePath("/settings/organization");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Something went wrong while creating the organization. Check the events log, or try again.",
    };
  }
}

/**
 * Besluit 7: de zetellimiet later aanpassen, in Admin, naast de organisatie in de lijst.
 * Raakt uitsluitend `seat_limit` — G42 verbiedt élke weg om het type te wijzigen.
 */
export async function setSeatLimitAction(input: {
  orgId: string;
  seatLimit: number;
}): Promise<OrgResult> {
  const toegang = await bewaakNiveau("intern", "setSeatLimitAction");
  try {
    const uitkomst = await setSeatLimitAsActor(db, {
      actorEmail: toegang.email,
      orgId: input.orgId,
      seatLimit: input.seatLimit,
    });
    if (!uitkomst.ok) return { ok: false, error: uitkomst.message };
    revalidatePath("/admin/users");
    revalidatePath("/settings/organization");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Something went wrong while saving the seat limit. Check the events log, or try again.",
    };
  }
}
