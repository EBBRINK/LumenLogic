"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { type MembershipRole } from "@/db/schema";
import { changeMembershipAsActor, setBrandingAsActor } from "@/lib/repo/authz";
import { bewaakRoute } from "@/lib/route-toegang";

const PAGE = "/admin/organizations";

const VALID_ROLES: MembershipRole[] = [
  "calculator",
  "werkvoorbereider",
  "projectleider",
  "org_admin",
];

// ⚠️ HIER STOND `createOrgAction`, en dat is sinds sprint 3.2c bewust weg (besluit 1,
// Timo 4 aug). Organisatiebeheer gaat volledig naar `/admin/users`:
// `app/admin/users/actions.ts` heeft nu `createOrgAction` (los aanmaken, besluit 4a) en
// `setSeatLimitAction` (besluit 7), plus de één-klik-variant in `issuePinAction({newOrg})`
// (besluit 4b). Dit scherm gaat daarna puur over branding en leden van BESTAANDE
// organisaties.
//
// Niet dupliceren, dus. "Iemand toegang geven" is in het hoofd van Brink één handeling en
// kostte twee schermen; twee aanmaakformulieren laten staan verdubbelt die versnippering in
// plaats van hem op te lossen. Wie hier een tweede ingang terugzet, zet ook de vraag terug
// wélke van de twee de waarheid is.

// LID: e-mail + gekozen petten. Onbekende rolwaarden worden weggefilterd (fail-safe);
// een lid zonder aangevinkte rol mag — dat is een eerlijk "geen rol", geen fout.
//
// ⚠️ Besluiten G36/G39. Dit is de TWEEDE deur naar precies dezelfde beslissing als het
// PIN-scherm: hier ontstaat een lidmaatschap mét rollen. Tot deze ronde stond hij open —
// alleen `requireSession()`, org en rollen rechtstreeks uit het formulier — en daarmee was
// de poort op het PIN-scherm zinloos: een gewone gebruiker zette zichzelf hier in de org met
// type 'intern' en was daarna volgens G36-regel 1 almachtig (gemeten door de critic, ronde
// 2). Beide deuren leunen nu op dezelfde regels in lib/repo/authz.ts; wie mag wat wordt
// dáár, op het moment van schrijven, uit de sessie en de database afgeleid.
//
// Een weigering is hier stil: dit is een `<form action={…}>` zonder retourkanaal, dus
// hetzelfde gedrag als bij een lege invoer hierboven. De weigering staat wél in de
// events-tabel (regel 5), en de UI toont een org_admin de knoppen sowieso niet.
export async function addMemberAction(formData: FormData) {
  const toegang = await bewaakRoute("/admin/organizations");
  const orgId = String(formData.get("orgId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orgId || !email) return;
  const roles = formData
    .getAll("roles")
    .map((r) => String(r))
    .filter((r): r is MembershipRole =>
      (VALID_ROLES as string[]).includes(r),
    );
  await changeMembershipAsActor(db, {
    actorEmail: toegang.email,
    orgId,
    email,
    roles,
    operation: "set",
  });
  revalidatePath(PAGE);
}

// LID: verwijderen. De repo normaliseert het adres; buiten de org valt niets te wissen.
// Zelfde poort als hierboven (G36/G39): een org_admin kan alleen zijn eigen leden
// verwijderen en nooit een collega-beheerder of zichzelf — dat laatste zou een organisatie
// zonder beheerder achterlaten.
export async function removeMemberAction(formData: FormData) {
  const toegang = await bewaakRoute("/admin/organizations");
  const orgId = String(formData.get("orgId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!orgId || !email) return;
  // De actor die main aan removeMembership meegeeft (voor het events-spoor) komt hier
  // uit de autorisatielaag zelf: die stelt de bevoegdheid vast en geeft daarna het
  // vastgestelde adres door aan removeMembership. Zo blijft het spoor compleet zónder
  // dat deze action nog een tweede keer een actor uit de sessie plukt.
  await changeMembershipAsActor(db, {
    actorEmail: toegang.email,
    orgId,
    email,
    operation: "remove",
  });
  revalidatePath(PAGE);
}

// BRANDING: logo-URL + accentkleur op de organisatie.
//
// ⚠️ Dit was de BEKENDE SCHULD uit `lib/repo/authz-deuren.test.ts` (sprint 3.2a). De action
// stond achter alléén `requireSession()`, schreef rechtstreeks op de organisatietabel en
// las de `orgId` uit het formulier — dus een gewone gebruiker uit org A overschreef de
// branding van org B, zonder spoor. Theoretisch zolang er één organisatie was; echt zodra
// de tweede erbij komt (G41), en dat staat op het punt te gebeuren.
//
// Nu dezelfde vorm als de twee deuren hierboven (G39): de poort en de schrijfactie zitten
// in één aanroep, `actorEmail` komt uit de sessie en de bevoegdheid wordt vers uit de
// database afgeleid. De `orgId` uit het formulier bepaalt alleen de vráág, nooit het
// antwoord "mag hij dit".
//
// Een weigering is hier stil, net als bij `addMemberAction`: dit is een `<form action={…}>`
// zonder retourkanaal. De weigering staat wél in de events-tabel (regel 5).
export async function saveBrandingAction(formData: FormData) {
  const toegang = await bewaakRoute("/admin/organizations");
  const orgId = String(formData.get("orgId") ?? "").trim();
  if (!orgId) return;
  await setBrandingAsActor(db, {
    actorEmail: toegang.email,
    orgId,
    logoUrl: String(formData.get("logoUrl") ?? ""),
    accentColor: String(formData.get("accentColor") ?? ""),
  });
  revalidatePath(PAGE);
}
