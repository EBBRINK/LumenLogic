// De mail-seam (docs/goal-auth-mail.md, bouwstap 1). Kale fetch naar Resend, geen SDK;
// fetch wordt hier gestubd zodat er nooit echt verkeer ontstaat.
import { afterEach, expect, test, vi } from "vitest";
import {
  consoleMailer,
  createResendMailer,
  defaultMailer,
  type MailMessage,
} from "@/lib/mail";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BERICHT: MailMessage = {
  to: "installateur@extern.nl",
  subject: "Reset your Lumen Logic password",
  text: "Reset link: https://example.test/reset-password?token=abc (valid for 15 minutes)",
  kind: "password_reset",
  url: "https://example.test/reset-password?token=abc",
};

function stubFetchOk(body: unknown = { id: "msg_123" }, status = 200) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

test("Resend-mailer: juiste endpoint, Bearer-header en payload", async () => {
  const mock = stubFetchOk();
  const mailer = createResendMailer({ apiKey: "re_testkey", from: "Lumen Logic <auth@mail.test>" });

  const receipt = await mailer(BERICHT);

  expect(mock).toHaveBeenCalledTimes(1);
  const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.resend.com/emails");
  expect(init.method).toBe("POST");
  const headers = init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer re_testkey");
  expect(headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(String(init.body))).toEqual({
    from: "Lumen Logic <auth@mail.test>",
    to: ["installateur@extern.nl"],
    subject: BERICHT.subject,
    text: BERICHT.text,
  });
  expect(receipt).toEqual({ id: "msg_123", status: 200 });
});

test("Resend-mailer: env-lezing gebeurt pas bij verzenden, niet bij aanmaken", async () => {
  // Eerst aanmaken terwijl de env nog leeg is — dan pas de waarden zetten. Werkt dit,
  // dan is de factory veilig te importeren in werelden zonder process.env.
  const omgeving: Record<string, string> = {};
  const mailer = createResendMailer({ readEnv: (k) => omgeving[k] });
  omgeving.RESEND_API_KEY = "re_envkey";
  omgeving.MAIL_FROM = "Lumen Logic <auth@mail.env>";
  const mock = stubFetchOk();

  await mailer(BERICHT);

  const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_envkey");
  expect(JSON.parse(String(init.body)).from).toBe("Lumen Logic <auth@mail.env>");
});

test("Resend-mailer: non-2xx throwt met de statuscode", async () => {
  stubFetchOk({ message: "invalid api key" }, 401);
  const mailer = createResendMailer({ apiKey: "re_fout", from: "a@b.test" });

  await expect(mailer(BERICHT)).rejects.toThrow(/401/);
});

test("Resend-mailer: netwerkfout throwt door", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed");
    }),
  );
  const mailer = createResendMailer({ apiKey: "re_test", from: "a@b.test" });

  await expect(mailer(BERICHT)).rejects.toThrow("fetch failed");
});

test("consoleMailer: logt byte-identiek aan de oude serverconsole-regels", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  await consoleMailer(BERICHT);
  await consoleMailer({ ...BERICHT, kind: "magic_link", to: "timo@jouwainstein.com" });

  expect(log).toHaveBeenNthCalledWith(
    1,
    "[auth] password reset voor installateur@extern.nl: https://example.test/reset-password?token=abc",
  );
  expect(log).toHaveBeenNthCalledWith(
    2,
    "[auth] magic link voor timo@jouwainstein.com: https://example.test/reset-password?token=abc",
  );
});

function fakeEnv(vars: Record<string, string>) {
  return (key: string) => vars[key] || undefined;
}

test("defaultMailer: zonder key → consoleMailer", () => {
  expect(defaultMailer(fakeEnv({}))).toBe(consoleMailer);
});

test("defaultMailer: key zónder MAIL_FROM → waarschuwing + consoleMailer (nooit stil falen)", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  expect(defaultMailer(fakeEnv({ RESEND_API_KEY: "re_welkey" }))).toBe(consoleMailer);
  expect(error).toHaveBeenCalledTimes(1);
  expect(String(error.mock.calls[0][0])).toContain("MAIL_FROM");
});

test("defaultMailer: key + MAIL_FROM → Resend-mailer die echt naar Resend post", async () => {
  const mailer = defaultMailer(
    fakeEnv({ RESEND_API_KEY: "re_welkey", MAIL_FROM: "Lumen Logic <auth@mail.test>" }),
  );
  expect(mailer).not.toBe(consoleMailer);

  const mock = stubFetchOk();
  await mailer(BERICHT);
  expect(mock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.anything());
});
