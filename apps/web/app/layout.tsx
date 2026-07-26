import type { Metadata, Viewport } from "next";
import { Blinker, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ui/ThemeProvider";

// Design system fonts (see the Bulletin design spec): three families, three jobs.
//   Blinker        display       → names, section headings, titles
//   IBM Plex Sans  UI sans       → body copy, buttons, conversational text
//   IBM Plex Mono  data + labels → dates, times, codes, letterspaced micro labels
// Blinker has no 500 (Medium) cut, so 600 (SemiBold) stands in for medium-weight display text.
const display = Blinker({
  variable: "--font-blinker",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});
const sans = IBM_Plex_Sans({
  variable: "--font-inter", // keep the var name so existing `var(--font-inter)` refs pick up the new UI sans
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const mono = IBM_Plex_Mono({
  variable: "--font-geist-mono", // keep the var name so existing mono refs pick up IBM Plex Mono
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bulletin - School Management System",
  description: "Bulletin — manage school report cards, students, and teachers",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow users to pinch-zoom (accessibility); we stop *auto*-zoom-on-focus
  // via a 16px input font-size on mobile in globals.css instead.
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        {/* "Share Tech" (Google Fonts) — used only by the "Official" report card/
            transcript header style (see OFFICIAL_HEADER_FONT in
            lib/api/reportCardTemplate.ts) to match real Cameroon institutional
            letterheads. Loaded as a direct stylesheet link (not next/font)
            so it's unambiguously the real Google-hosted font file, verifiable
            in the network tab / page source. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
