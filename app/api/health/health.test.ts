// Bewijs bij het health-endpoint (sprint 3, minimale monitoring vóór externen).
//
// Wat hier getoetst wordt is niet "geeft hij 200" — dat is de makkelijke helft. De
// twee dingen die echt kunnen misgaan zijn: (1) hij blijft 200 geven terwijl de
// database weg is, waardoor de monitor je een storing niet meldt, en (2) hij lekt in
// zijn antwoord iets over de binnenkant, want dit is de enige route die zonder sessie
// bij de database komt.
import { beforeEach, expect, test, vi } from "vitest";
import { ROUTE_NIVEAUS } from "@/lib/route-allowlist";

const execute = vi.fn();
vi.mock("@/db/client", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));

beforeEach(() => {
  execute.mockReset();
});

async function roep() {
  const { GET } = await import("./route");
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("de route staat als 'open' in de allowlist — anders ziet de monitor een 404", () => {
  // Sinds 3.2a is een route die niet in ROUTE_NIVEAUS staat geweigerd. Een monitor die
  // niet inlogt zou dan permanent "storing" melden terwijl de app het prima doet — de
  // duurste variant van een vals alarm, want daar leer je alarmen door negeren.
  expect(ROUTE_NIVEAUS["/api/health"]).toBe("open");
});

test("database bereikbaar → 200 met alleen een status", async () => {
  execute.mockResolvedValue([{ "?column?": 1 }]);
  const { status, body } = await roep();

  expect(status).toBe(200);
  expect(body).toEqual({ status: "ok" });
  // De check raakt de database écht aan. Zonder deze assertie zou een endpoint dat
  // altijd blind 200 teruggeeft deze test even goed doorstaan — en dan meet de
  // monitor alleen nog of Vercel HTML kan serveren.
  expect(execute).toHaveBeenCalledTimes(1);
});

test("database weg → 503, want een groene monitor bij een dode database is erger dan geen monitor", async () => {
  execute.mockRejectedValue(new Error("connection refused"));
  const { status, body } = await roep();

  expect(status).toBe(503);
  expect(body).toEqual({ status: "degraded" });
});

test("het antwoord lekt niets over de binnenkant", async () => {
  execute.mockRejectedValue(
    new Error('relation "activation_pins" does not exist at 10.0.0.4:5432'),
  );
  const { body } = await roep();

  // Precies deze fout is het scenario: een migratie die niet gedraaid heeft. De
  // foutmelding noemt een tabelnaam én een intern adres, en dit endpoint is publiek.
  const tekst = JSON.stringify(body);
  for (const verboden of ["activation_pins", "relation", "10.0.0.4", "5432", "does not exist"]) {
    expect(tekst, `"${verboden}" hoort niet in een publiek antwoord`).not.toContain(verboden);
  }
  // En het blijft bij de twee sleutels die we beloven — geen stack, geen versie.
  expect(Object.keys(body)).toEqual(["status"]);
});
