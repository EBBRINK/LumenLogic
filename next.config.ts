import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Oude "dossiers"-routes blijven permanent werken (B1, docs/plan-aanvraag-estimate.md).
      { source: "/dossiers", destination: "/projecten", permanent: true },
      { source: "/dossiers/:path*", destination: "/projecten/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
