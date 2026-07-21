// Unit-tests voor de classificator uit lib/next-action-result.ts.
//
// Het belangrijkste hier is de ANKER-TEST: de fouten waarmee we testen worden
// gebouwd met Next' EIGEN redirect()/notFound(), niet met een zelfgetypte
// digest-string. Daarmee is de fixture per constructie echt. Precies dát ontbrak
// vorige keer: de oude stubs modelleerden succes als een nette resolve — het
// enige geval dat Next nooit produceert — en daardoor bleef de suite groen
// terwijl productie loog (docs/probleem-liegende-import-melding.md §5).
import { expect, test } from "vitest";
import { notFound, redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  callAction,
  failureDetail,
  isAccessFallback,
  redirectHrefOf,
} from "./next-action-result";

// De error die Next zelf gooit bij redirect(). De reducer verrijkt hem met
// handled=true voordat hij ermee rejectet (server-action-reducer.js:308-312).
export function nextRedirectError(href: string): Error {
  try {
    redirect(href, "push");
  } catch (e) {
    (e as { handled?: boolean }).handled = true;
    return e as Error;
  }
  throw new Error("redirect() gooide niet — fixture ongeldig");
}

function nextNotFoundError(): Error {
  try {
    notFound();
  } catch (e) {
    return e as Error;
  }
  throw new Error("notFound() gooide niet — fixture ongeldig");
}

const PROJECT = { path: "/projects/d1" };

// ── Anker: de fixture is er volgens Next zélf één ────────────────────────────

test("anker: onze redirect-fixture is een echte Next-redirect", () => {
  const e = nextRedirectError("/projects/d1?pdf=20&run=r1&route=leesroute");
  // Next' eigen oordeel…
  expect(isRedirectError(e)).toBe(true);
  expect(e.message).toBe("NEXT_REDIRECT");
  // …en het onze komt op dezelfde bestemming uit.
  expect(redirectHrefOf(e)).toBe("/projects/d1?pdf=20&run=r1&route=leesroute");
});

test("anker: een notFound() is GEEN redirect (en dus geen navigatiesignaal)", () => {
  const e = nextNotFoundError();
  expect(isRedirectError(e)).toBe(false);
  expect(redirectHrefOf(e)).toBeNull();
  expect(isAccessFallback(e)).toBe(true);
});

// ── redirectHrefOf: alleen echte NEXT_REDIRECT-digests ───────────────────────

test("redirectHrefOf accepteert alleen een volledige NEXT_REDIRECT-digest", () => {
  expect(redirectHrefOf(null)).toBeNull();
  expect(redirectHrefOf("kapot")).toBeNull();
  expect(redirectHrefOf(new Error("boem"))).toBeNull();
  // lijkt erop, is het niet
  expect(redirectHrefOf({ digest: "NEXT_REDIRECTISH;push;/x;307;" })).toBeNull();
  // geldig codewoord, ongeldig type
  expect(redirectHrefOf({ digest: "NEXT_REDIRECT;zijwaarts;/x;307;" })).toBeNull();
  // geldig codewoord, geen statuscode
  expect(redirectHrefOf({ digest: "NEXT_REDIRECT;push;/x;nogal;" })).toBeNull();
});

test("redirectHrefOf plakt een href mét puntkomma's weer heel", () => {
  // split(';')[2] zou hier "/projects/d1?q=a" opleveren en de bestemming
  // verminken — daarom slice(2, -2).join(';'), net als Next zelf doet.
  const e = { digest: "NEXT_REDIRECT;push;/projects/d1?q=a;b;307;" };
  expect(redirectHrefOf(e)).toBe("/projects/d1?q=a;b");
});

// ── callAction: classificeren op bestemming, default = falen ─────────────────

test("redirect naar de verwachte route = arrived (het enige succespad)", async () => {
  const out = await callAction(async () => {
    throw nextRedirectError("/projects/d1?pdf=20&run=r1&route=leesroute");
  }, PROJECT);
  expect(out.kind).toBe("arrived");
});

test("redirect naar /login = signedOut, nooit succes (F3: requireSession)", async () => {
  const out = await callAction(async () => {
    throw nextRedirectError("/login");
  }, PROJECT);
  expect(out.kind).toBe("signedOut");
});

test("redirect naar een ander dossier = divertedTo, dus GEEN succes", async () => {
  const out = await callAction(async () => {
    throw nextRedirectError("/projects/d2?pdf=20&run=r1");
  }, PROJECT);
  expect(out.kind).toBe("divertedTo");
});

test("redirect naar een onbekende route = divertedTo (default-deny)", async () => {
  const out = await callAction(async () => {
    throw nextRedirectError("/data/brands");
  }, PROJECT);
  expect(out.kind).toBe("divertedTo");
});

test("notFound() uit een action = failed, niet stil weggenavigeerd", async () => {
  const out = await callAction(async () => {
    throw nextNotFoundError();
  }, PROJECT);
  expect(out.kind).toBe("failed");
});

test("netwerkfout = failed", async () => {
  const out = await callAction(async () => {
    throw new TypeError("Failed to fetch");
  }, PROJECT);
  expect(out.kind).toBe("failed");
  if (out.kind === "failed") {
    expect(failureDetail(out.error)).toBe("Failed to fetch");
  }
});

test("een non-Error throw laat de classificator niet omvallen", async () => {
  for (const boem of ["kapot", null, undefined, 42]) {
    const out = await callAction(async () => {
      throw boem;
    }, PROJECT);
    expect(out.kind).toBe("failed");
    expect(typeof failureDetail(boem)).toBe("string");
  }
});

test("een antwoord van de action komt door als value (error én void)", async () => {
  const metError = await callAction(
    async () => ({ error: "Testfout" }),
    PROJECT,
  );
  expect(metError).toEqual({ kind: "value", value: { error: "Testfout" } });

  const leeg = await callAction<void>(async () => {}, PROJECT);
  expect(leeg).toEqual({ kind: "value", value: undefined });
});

test("failureDetail benoemt een access-fallback herkenbaar", () => {
  expect(failureDetail(nextNotFoundError())).toMatch(/refused the request \(404\)/);
  expect(failureDetail({})).toBe("unknown error");
});
