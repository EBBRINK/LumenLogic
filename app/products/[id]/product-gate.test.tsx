// De sessiepoort op /products/[id] (reviewzwerm 2.5a, A5).
//
// Wat hier gepind wordt en waarom het ontbrak: /products/[id] was de enige inhoudspagina
// zonder `requireSession()` — de redenering was dat de tier-gating het werk deed. Die hield
// niet (zie lib/repo/disclosure.test.ts), dus een uitgelogde bezoeker met een gedeelde
// deeplink zag de brutoprijs.
//
// De reviewzwerm merkte apart op (B12) dat GEEN ENKELE test bewees dat de sessiepoort een
// niet-ingelogde beller weigert. Dit bestand is dat bewijs voor deze ingang.
//
// Harnas: zelfde patroon als app/login/login-gate.test.ts — de sessielaag wordt gemockt
// (de echte trekt better-auth plus de database mee en kent in een test geen cookie), maar
// `requireSession` gedraagt zich hier exact als de echte: geen sessie → redirect("/login").
// Het bewijs is de NEXT_REDIRECT-digest. Rendert de pagina gewoon, dan is de bug terug.
//
// next/link wordt hier gestubd. Dat is harnasgrens 1 uit app/fallbacks.test.tsx: een
// SERVER-component die next/link importeert is in deze opstelling niet te laden — de
// react-server-build klapt met "client reference export is called on server". Deze tests
// gaan over de poort, niet over de opmaak, dus een kale <a> volstaat.
import { expect, test, vi } from "vitest";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  sessie: null as unknown,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: React.ReactNode;
  }) => <a href={href} {...rest}>{children}</a>,
}));

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

vi.mock("@/lib/session", async () => {
  const { redirect } = await import("next/navigation");
  return {
    getSession: async () => harnas.sessie,
    requireSession: async () => {
      if (!harnas.sessie) redirect("/login");
      return harnas.sessie;
    },
    getActor: async () =>
      (harnas.sessie as { user?: { email?: string } } | null)?.user?.email ?? "anoniem",
  };
});

const { default: ProductPage } = await import("./page");

const INGELOGD = { user: { email: "hello@noplasticfloralfoam.com" } };

// De digest van redirect()/notFound() uitlezen: dát is het bewijs dat de poort dichtstaat.
async function digestVan(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return String((e as { digest?: string }).digest ?? "");
  }
  throw new Error("verwacht een throw (redirect/notFound), maar de call resolvede");
}

async function seedProduct(db: TestDb) {
  return seedBrandProduct(db, {
    brand: "XAL",
    name: "SASSO 100 SQ SP CEIL 2700K",
    price: "310.00",
    articleCode: "L360-SASSO100",
  });
}

// ── De poort op de pagina ────────────────────────────────────────────────────

test("A5: uitgelogd → /products/[id] stuurt door naar /login, geen productdata", async () => {
  const db = await createTestDb();
  harnas.db = db;
  harnas.sessie = null;
  const { productId } = await seedProduct(db);

  const digest = await digestVan(() =>
    ProductPage({
      params: Promise.resolve({ id: productId }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(digest).toContain("NEXT_REDIRECT");
  expect(digest).toContain("/login");
});

// De tegenproef: de poort mag de pagina niet slopen. Een ingelogde interne kijker ziet
// het product gewoon, mét prijs — tier1 blijft voor hém ongewijzigd.
test("A5: ingelogd → de productkaart rendert gewoon, inclusief adviesprijs", async () => {
  const db = await createTestDb();
  harnas.db = db;
  harnas.sessie = INGELOGD;
  const { productId } = await seedProduct(db);

  const ui = await ProductPage({
    params: Promise.resolve({ id: productId }),
    searchParams: Promise.resolve({}),
  });
  expect(ui).toBeTruthy();
});

test("A5: een niet-uuid geeft 404, ook vóór de sessiecheck iets prijsgeeft", async () => {
  const db = await createTestDb();
  harnas.db = db;
  harnas.sessie = INGELOGD;
  const digest = await digestVan(() =>
    ProductPage({
      params: Promise.resolve({ id: "nope" }),
      searchParams: Promise.resolve({}),
    }),
  );
  expect(digest).toContain("NEXT_HTTP_ERROR_FALLBACK;404");
});
