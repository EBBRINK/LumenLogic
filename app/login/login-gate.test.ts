// De sessiepoort op /login (UX-audit 30 jul, bug #7). Tot deze sprint was
// app/login/page.tsx een client component ZONDER sessiecheck: een ingelogde gebruiker
// kreeg de volledige navbalk én een "Send magic link"-formulier, zonder redirect en
// zonder enige melding dat hij al binnen was.
//
// Waarom een eigen bestand en niet bij components/login.test.tsx: de vi.mock hieronder
// herbouwt de modulegraaf, en daarna rendert een CLIENT-component in deze harnas leeg
// (de client-reference-registry hoort bij de eerste graaf). Gemeten op 30 jul: mét de
// mock in hetzelfde bestand vielen alle vier de screenshot-tests van het formulier om
// op een lege <div>. Vandaar de splitsing — hier alleen de poort, geen render.
import { afterEach, expect, test, vi } from "vitest";

// De sessielaag is de enige afhankelijkheid van de pagina; de echte versie trekt
// better-auth plus de database mee en kent in een test geen cookie.
const sessie = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/session", () => ({
  getSession: async () => sessie.value,
}));

afterEach(() => {
  sessie.value = null;
});

async function loginPage() {
  const mod = await import("./page");
  return mod.default;
}

test("ingelogd: /login rendert niets meer maar stuurt door naar /projects", async () => {
  sessie.value = { user: { email: "hello@noplasticfloralfoam.com" } };
  const LoginPage = await loginPage();

  // redirect() gooit NEXT_REDIRECT met de bestemming in de digest — dát is het bewijs
  // dat de poort dichtstaat. Resolvet de call gewoon, dan is de bug terug.
  let digest: string | undefined;
  await expect(
    (async () => {
      try {
        await LoginPage();
      } catch (e) {
        digest = (e as { digest?: string }).digest;
        throw e;
      }
    })(),
  ).rejects.toBeTruthy();
  expect(digest).toContain("NEXT_REDIRECT");
  expect(digest).toContain("/projects");
});

test("uitgelogd: /login geeft het formulier terug, geen redirect", async () => {
  sessie.value = null;
  const LoginPage = await loginPage();
  // Geen throw, en er komt echt een element uit (het client-referentie-object van
  // LoginForm) — geen null en geen redirect.
  const ui = await LoginPage();
  expect(ui).toBeTruthy();
});
