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
  title: "ReportCard - School Management System",
  description: "Manage school report cards, students, and teachers",
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
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
