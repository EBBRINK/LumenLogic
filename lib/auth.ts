import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db/client";
import * as authSchema from "@/db/auth-schema";

export const auth = betterAuth({
  // baseURL uit env; op Vercel valt hij terug op de deploy-URL (preview per PR).
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined),
  database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Geen e-mailprovider in deze fase — er is één gebruiker (Timo).
        // De magic link verschijnt in de serverconsole; daar klik je hem uit.
        console.log(`[auth] magic link voor ${email}: ${url}`);
      },
    }),
  ],
});
