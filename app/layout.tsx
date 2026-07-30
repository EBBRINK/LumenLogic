import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumen Logic",
  description: "Spec, calculation and quotation tool for the professional lighting market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning omdat het script hieronder de klasse `dark` op <html>
    // kan zetten vóórdat React hydrateert: de server kan de opgeslagen themakeuze niet
    // kennen, dus className wijkt dan per definitie af. Alleen dit ene element, niet de
    // boom eronder.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Eerste kind van <body>, dus het draait vóór de rest van het document
            geparsed is en dus vóór de eerste paint: geen flits van het verkeerde thema.
            Inline en zonder async, want een gehoist of uitgesteld script komt te laat.
            De inhoud is een constante uit lib/theme.ts — geen gebruikersinvoer. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
