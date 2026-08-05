import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // TypeScript 7 is de native (Go) compiler en levert géén JS-API meer mee
    // (lib/typescript.js is weg, komt terug in 7.1). Next moet daarom de
    // `tsc`-CLI aanroepen i.p.v. de programmatic API — anders denkt `next build`
    // dat TypeScript niet geïnstalleerd is en probeert het het bij te installeren.
    useTypeScriptCli: true,
    // 413-vangnet: uploads gaan sinds de client-side PDF-extractie als tekst-pagina's
    // (klein) naar server-actions, nooit meer als binaire PDF. Mocht er tóch ooit een
    // grote action-payload ontstaan, dan is 4 MB het plafond — bewust nét onder
    // Vercel's harde ~4,5 MB request-limiet — i.p.v. de default 1 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    return [
      // Oude "dossiers"-routes blijven permanent werken (B1, docs/plan-aanvraag-estimate.md).
      { source: "/dossiers", destination: "/projects", permanent: true },
      { source: "/dossiers/:path*", destination: "/projects/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
