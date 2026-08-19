// De mail-laag van de auth-flow (docs/goal-auth-mail.md). Eén seam, geïnjecteerd in de
// auth-factory naar het model van de database-injectie: productie krijgt defaultMailer(),
// tests injecteren een capture-mailer. Bewust een kale fetch naar de Resend-REST-API en
// geen SDK (extra dependency, react-email-typings, TS7-risico).
//
// Dit bestand is database-vrij: events over verzonden/mislukte mails logt de factory-callback
// (lib/auth-factory.ts), niet deze laag.

export type MailKind = "password_reset" | "magic_link";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  // kind + url zitten in het bericht zodat consoleMailer (de fallback zonder key) exact
  // de oude serverconsole-regels kan blijven loggen, en de factory het soort mail in de
  // event-payload kan zetten. De url komt NOOIT in een event-payload terecht.
  kind: MailKind;
  url: string;
};

// Wat de transportlaag over de verzending kan terugvertellen: Resend geeft een message-id
// en een statuscode; de console-fallback heeft niets te melden (void).
export type MailReceipt = { id?: string; status?: number };

export type Mailer = (msg: MailMessage) => Promise<MailReceipt | void>;

// process.env is er niet in de vitest-browserrun; deze module moet in beide werelden laden.
// Daarom gebeurt élke env-lezing binnen een functie, nooit op moduleniveau — en is de
// lezer zelf een seam (EnvSource), want vi.stubEnv bereikt de browserrun niet.
// Lege string telt als afwezig: dat is wat een leeg veld in Vercel oplevert.
export type EnvSource = (key: string) => string | undefined;

const processEnv: EnvSource = (key) =>
  (typeof process !== "undefined" ? process.env?.[key] : undefined) || undefined;

const KIND_CONSOLE_LABEL: Record<MailKind, string> = {
  password_reset: "password reset",
  magic_link: "magic link",
};

// Byte-identiek aan de logregels uit de fase zonder mailprovider — de Vercel-logs-route
// uit CLAUDE.md ("Magic link ophalen") blijft dus letterlijk werken zonder key.
export const consoleMailer: Mailer = async (msg) => {
  console.log(`[auth] ${KIND_CONSOLE_LABEL[msg.kind]} voor ${msg.to}: ${msg.url}`);
};

export type ResendMailerOptions = { apiKey?: string; from?: string; readEnv?: EnvSource };

// Eén poging, geen retry (besluit in het goal-doc): faalt de call, dan throwt hij en
// vangt de factory-callback dat op (URL alsnog naar de console + auth_mail_failed-event).
export function createResendMailer(options: ResendMailerOptions = {}): Mailer {
  const readEnv = options.readEnv ?? processEnv;
  return async (msg) => {
    // Env pas hier lezen, niet bij aanmaken: zo is de factory overal importeerbaar.
    const apiKey = options.apiKey ?? readEnv("RESEND_API_KEY");
    const from = options.from ?? readEnv("MAIL_FROM");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) {
      throw new Error(`Resend antwoordde ${res.status} voor ${msg.kind}-mail`);
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { id: data?.id, status: res.status };
  };
}

// De keuzelogica: key + MAIL_FROM aanwezig → Resend; anders console. Een key zónder
// MAIL_FROM is een halve configuratie — dan luid waarschuwen en op console terugvallen,
// nooit stil falen.
export function defaultMailer(readEnv: EnvSource = processEnv): Mailer {
  const apiKey = readEnv("RESEND_API_KEY");
  const from = readEnv("MAIL_FROM");
  if (apiKey && from) return createResendMailer({ readEnv });
  if (apiKey && !from) {
    console.error(
      "[auth] RESEND_API_KEY staat wel maar MAIL_FROM ontbreekt — auth-mails vallen terug op de serverconsole.",
    );
  }
  return consoleMailer;
}
