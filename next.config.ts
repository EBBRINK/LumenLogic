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
      // Sprint 2.0a: het event-log verhuisde van Admin naar Data — en met de
      // IA-opschoning van 12 aug weer terug. Beide oude adressen blijven werken.
      { source: "/admin/events", destination: "/admin/event-log", permanent: true },
      // IA-opschoning 12 aug 2026 (demosessie Brink Licht): de Data-werkbank is opgeheven.
      // Merkgebonden schermen gingen naar /brand-management, beheerschermen naar /admin.
      // Deze regels houden bestaande bookmarks en gedeelde links werkend; alleen het
      // verrijkings-steekproefscherm (/data/enrichment/*) heeft geen bestemming meer —
      // die functie zit nu in de prijslijst-skill, dus dat pad valt bewust op een 404.
      { source: "/data", destination: "/admin", permanent: true },
      {
        source: "/data/brand-relations",
        destination: "/brand-management",
        permanent: true,
      },
      {
        source: "/data/brand-relations/:path*",
        destination: "/brand-management/:path*",
        permanent: true,
      },
      {
        source: "/data/price-lists",
        destination: "/brand-management/price-lists",
        permanent: true,
      },
      { source: "/data/fields", destination: "/admin/fields", permanent: true },
      { source: "/data/event-log", destination: "/admin/event-log", permanent: true },
      { source: "/data/loading", destination: "/admin/loading", permanent: true },
      { source: "/data/evaluation", destination: "/admin/evaluation", permanent: true },
      // Punt 7: organisaties zijn beheer, geen accountinstelling.
      {
        source: "/settings/organization",
        destination: "/admin/organizations",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
