import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ui/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
    <html lang="en" suppressHydrationWarning className={inter.variable}>
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
