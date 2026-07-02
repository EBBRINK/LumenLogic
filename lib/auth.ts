import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";

export const auth = betterAuth({
  database: {
    provider: "pg",
    url: process.env.DATABASE_URL!,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Geen e-mailprovider in deze fase — er is één gebruiker.
        console.log(`[auth] magic link voor ${email}: ${url}`);
      },
    }),
  ],
});
