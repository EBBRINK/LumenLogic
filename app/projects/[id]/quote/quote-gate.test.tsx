// De kopblokpoort op de estimate-tab, gemeten aan de ECHTE pagina en de ECHTE route —
// niet aan een handgebouwde actions-prop (herstel 2026-07-30).
//
// Waarom dit bestand bestaat: components/dossier/estimate.test.tsx bouwt de actiebalk
// zelf op als fixture. Daardoor pinde niets de regel in page.tsx die de knoppen
// wegneemt: je kon het `outputsAllowed &&`-omhulsel schrappen en er ging geen enkele
// test rood. Hetzelfde gold voor de 409 op /quote/pdf en voor xisExportAction.
//
// Harnasgrens (zie ook app/login/login-gate.test.ts): met vi.mock in dit bestand wordt
// de modulegraaf herbouwd en renderen CLIENT-componenten leeg. PrintButton en
// XisPushDialog zijn client — die zijn hier dus niet te zien. De "Download PDF"-knop is
// een gewone server-gerenderde <a> en staat er wél; die is het anker van deze tests.
import { page } from "vitest/browser";
import { expect, test, vi } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { extractText, getDocumentProxy } from "unpdf";
import { memberships, organizations, projectDossiers, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import { generateQuote, updateQuoteHeader } from "@/lib/repo/dossiers";
import { setStatus } from "@/lib/repo/project-status";
import { getXisExports } from "@/lib/repo/xis";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "hello@noplasticfloralfoam.com",
  // Schakelaar voor de sessiepoort-test onderaan: `true` = geen sessie, en de mock
  // hieronder gedraagt zich dan als de ECHTE requireSession (redirect naar /login).
  uitgelogd: false,
}));

// db/client.ts gooit al bij import zonder DATABASE_URL en praat met Neon; hier komt de
// PGlite-testdatabase ervoor in de plaats. De proxy bindt methodes aan de échte drizzle-
// instantie, anders verliezen ze hun `this`.
vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        return typeof waarde === "function" ? waarde.bind(echt) : waarde;
      },
    },
  ),
}));

// Schakelbare sessie. Bij `uitgelogd` roept requireSession het ECHTE redirect() uit
// next/navigation aan — precies zoals lib/session.ts:12 — zodat de poort-test op Next'
// eigen NEXT_REDIRECT-signaal meet en niet op een zelfverzonnen throw uit deze mock.
vi.mock("@/lib/session", async () => {
  const { redirect } = await import("next/navigation");
  const sessie = () =>
    harnas.uitgelogd ? null : { user: { email: harnas.email } };
  return {
    getSession: async () => sessie(),
    requireSession: async () => {
      const s = sessie();
      if (!s) redirect("/login");
      return s;
    },
    getActor: async () => sessie()?.user.email ?? "anoniem",
  };
});

// revalidatePath heeft buiten een request-scope geen store; de acties roepen hem wel aan.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { default: EstimatePage } = await import("./page");
const { GET } = await import("./pdf/route");
const { xisExportAction } = await import("./actions");

// Twee tellende regels — genoeg voor een offerte met inhoud, klein genoeg om snel te zijn.
async function seedDossier(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();
  const p = await seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
  });
  await db.insert(specLines).values({
    dossierId: dossier.id,
    fixtureCode: "Lp301",
    zone: "A-08",
    status: "groen",
    quantity: 12,
    matchedProductId: p.productId,
    brandText: "XAL",
    productText: "SASSO 100",
    sortOrder: 0,
  });
  return dossier.id;
}

// Sinds sprint 3.2b beslist de pagina óók welk renderpad je krijgt: een EXTERN account
// ziet het prijsloze stuk, zonder kopblok-banner en zonder "Edit header". Dat pad wordt
// apart getoetst (components/dossier/estimate-extern.test.tsx). Deze tests gaan over de
// kopblokpoort op het INTERNE scherm, dus de sessie-actor krijgt hier een lidmaatschap
// in de interne org — anders levert resolvePrijszicht "extern" (default = veilig) en
// zoeken de asserties hieronder naar knoppen die op dat pad niet bestaan.
async function maakActorIntern(db: TestDb) {
  const orgs = await db.select().from(organizations);
  const intern = orgs.find((o) => o.slug === "brink-licht");
  if (!intern) throw new Error("interne org ontbreekt — migratie 0017 niet gedraaid?");
  await db
    .insert(memberships)
    .values({ orgId: intern.id, email: harnas.email, roles: ["calculator"] });
}

async function nieuweStand() {
  const db = await createTestDb();
  harnas.db = db;
  await maakActorIntern(db);
  const dossierId = await seedDossier(db);
  return { db, dossierId };
}

function renderPagina(id: string) {
  return renderServer(<EstimatePage params={Promise.resolve({ id })} />);
}

const downloadKnop = () => page.getByRole("link", { name: "Download PDF" });

// De EERSTE render in dit bestand trekt de hele pagina-modulegraaf (page → repo → pdf →
// db) door de transform; gemeten op 30 jul duurde dat ~17 s op een koude vite-cache,
// ruim over de standaard wachttijd van expect.element. Vandaar deze ruimere marge op
// elke render-assertie — niet omdat de assertie traag is, maar omdat de eerste compile
// dat is. Wie hem weghaalt krijgt een test die alleen op een warme cache slaagt.
const RENDER_WACHT = { timeout: 30_000 };

// ── De pagina ────────────────────────────────────────────────────────────────

test("verse generatie: de uitgangen staan er meteen — geen tussenstop", async () => {
  const { dossierId } = await nieuweStand();
  await generateQuote(harnas.db as TestDb, dossierId, harnas.email);

  await renderPagina(dossierId);
  await expect.element(downloadKnop(), RENDER_WACHT).toBeInTheDocument();
  await expect.element(downloadKnop()).toHaveAttribute(
    "href",
    `/projects/${dossierId}/quote/pdf`,
  );
  // Geen banner: de kop is compleet (datum + voorgestelde geldigheid).
  expect(page.getByRole("status").query()).toBeNull();
});

test("kop leeggemaakt en niet bevroren: Download PDF is weg, de banner legt uit waarom", async () => {
  const { db, dossierId } = await nieuweStand();
  await generateQuote(db, dossierId, harnas.email);
  await updateQuoteHeader(db, dossierId, { validUntil: null }, harnas.email);

  await renderPagina(dossierId);
  const melding = page.getByRole("status");
  await expect.element(melding, RENDER_WACHT).toBeInTheDocument();
  expect(melding.element().textContent).toContain("Valid until is still empty");
  // Dít is de assertie die valt zodra het `outputsAllowed &&`-omhulsel uit page.tsx
  // verdwijnt.
  expect(downloadKnop().query()).toBeNull();
  // De kop is bewerkbaar (er is een offerte, niet bevroren) → de instructie mag naar
  // "Edit header" wijzen, en dat blok staat er dan ook echt.
  expect(melding.element().textContent).toContain("Edit header");
  await expect.element(page.getByText("Edit header").first()).toBeInTheDocument();
});

test("BEVROREN met een lege kop: Download PDF staat er, en er is geen banner", async () => {
  const { db, dossierId } = await nieuweStand();
  await generateQuote(db, dossierId, harnas.email);
  await updateQuoteHeader(db, dossierId, { validUntil: null }, harnas.email);
  // De drie-kliksval: genereren → status "estimate gestuurd" → tab Estimate.
  await setStatus(db, dossierId, "estimate_gestuurd", harnas.email);

  await renderPagina(dossierId);
  await expect.element(downloadKnop(), RENDER_WACHT).toBeInTheDocument();
  // De render is hierboven bewezen aanwezig; pas dan zeggen "geen banner" iets.
  expect(page.getByRole("status").query()).toBeNull();
  // Het kopblok is op slot (I-06) — de banner mag daar dus ook niet naar wijzen.
  expect(page.getByText("Edit header").query()).toBeNull();
});

// ── De PDF-route (dezelfde poort, zonder scherm) ─────────────────────────────

test("PDF-route: 409 bij een lege kop, 200 zodra de offerte bevroren is", async () => {
  const { db, dossierId } = await nieuweStand();
  await generateQuote(db, dossierId, harnas.email);
  await updateQuoteHeader(db, dossierId, { validUntil: null }, harnas.email);

  const geweigerd = await GET(new Request("http://test/pdf"), {
    params: Promise.resolve({ id: dossierId }),
  });
  expect(geweigerd.status).toBe(409);
  expect(await geweigerd.text()).toContain("Valid until");

  // Zelfde lege kop, nu bevroren: het stuk IS verstuurd en moet terug te halen zijn.
  await setStatus(db, dossierId, "estimate_gestuurd", harnas.email);
  const toegestaan = await GET(new Request("http://test/pdf"), {
    params: Promise.resolve({ id: dossierId }),
  });
  expect(toegestaan.status).toBe(200);
  expect(toegestaan.headers.get("Content-Type")).toBe("application/pdf");
});

// ── Prijszicht op de ECHTE route (sprint 3.2b) ───────────────────────────────
//
// De sjablonen worden apart getoetst (lib/pdf/estimate-extern.test.ts). Wat hier wordt
// vastgepind is de WISSEL: dezelfde GET, hetzelfde dossier, alleen een andere sessie —
// en dan komen er wel of geen bedragen uit de bytes die de deur uit gaan. Zonder deze
// test kun je de regel in route.ts schrappen en blijft alles groen, precies de reden
// waarom dit bestand bestaat.
test("PDF-route: intern krijgt bedragen, extern krijgt er nul", async () => {
  const { db, dossierId } = await nieuweStand(); // actor zit in de interne org
  await generateQuote(db, dossierId, harnas.email);

  const bedragen = async (res: Response) => {
    const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  };
  const haal = () =>
    GET(new Request("http://test/pdf"), {
      params: Promise.resolve({ id: dossierId }),
    });

  const internTekst = await bedragen(await haal());
  expect(internTekst).toContain("€");
  expect(internTekst).toContain("Unit price");

  // Zelfde dossier, ander account: dit adres heeft geen enkel lidmaatschap en is dus
  // extern (default = veilig).
  const eerder = harnas.email;
  harnas.email = "piet@devries.nl";
  try {
    const externTekst = await bedragen(await haal());
    expect(externTekst).not.toContain("€");
    expect(externTekst).not.toContain("Unit price");
    expect(externTekst).not.toContain("Line total");
    // …en het is wél het stuk van dit dossier, geen leeg vel.
    expect(externTekst).toContain("Ziekenhuis Noord");
    expect(externTekst).toContain("Lp301");
  } finally {
    harnas.email = eerder;
  }
});

// ── De XIS-action (een verborgen knop is geen poort) ─────────────────────────

// ── De sessiepoort (B12) ─────────────────────────────────────────────────────
// De mock bovenin gaf tot deze pas ALTIJD een sessie terug; daardoor bewees geen
// enkele test dat `await requireSession()` in actions.ts iets doet. Deze test draait
// exact de stand die hieronder wél doorkomt (bevroren offerte), maar uitgelogd: de
// enige juiste uitkomst is /login én een LEGE xis_exports-tabel. Dat tweede is de
// kern — het scheidt "de poort weigerde" van "hij exporteerde en navigeerde daarna".
test("uitgelogd: xisExportAction stuurt niets door — /login, geen export", async () => {
  const { db, dossierId } = await nieuweStand();
  await generateQuote(db, dossierId, harnas.email);
  await setStatus(db, dossierId, "estimate_gestuurd", harnas.email);

  const fd = new FormData();
  fd.set("dossierId", dossierId);

  harnas.uitgelogd = true;
  let digest = "";
  try {
    await xisExportAction(fd);
  } catch (e) {
    digest = (e as { digest?: string }).digest ?? "";
  } finally {
    harnas.uitgelogd = false;
  }
  expect(digest).toContain("NEXT_REDIRECT");
  expect(digest).toContain("/login");

  // Dezelfde POST slaagt ingelogd (test hieronder) — hier mag er niets staan.
  expect(await getXisExports(db, dossierId)).toEqual([]);
});

test("xisExportAction: weigert bij een lege kop, laat een bevroren offerte door", async () => {
  const { db, dossierId } = await nieuweStand();
  await generateQuote(db, dossierId, harnas.email);
  await updateQuoteHeader(db, dossierId, { validUntil: null }, harnas.email);

  // Handgemaakte POST — de UI biedt deze knop nu niet aan, maar dat is geen beveiliging.
  const fd = new FormData();
  fd.set("dossierId", dossierId);
  await xisExportAction(fd);
  expect(await getXisExports(db, dossierId)).toEqual([]);

  await setStatus(db, dossierId, "estimate_gestuurd", harnas.email);
  await xisExportAction(fd);
  expect((await getXisExports(db, dossierId)).length).toBe(1);
});
