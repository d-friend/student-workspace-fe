import type { Metadata } from "next";
import { Be_Vietnam_Pro, Bricolage_Grotesque } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import { THEME_INIT } from "@/lib/theme";
import "../styles/tokens.css";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["vietnamese", "latin"],
  weight: ["700", "800"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "D-Friend",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_INIT sets data-theme on <html> before React hydrates.
    <html lang="vi" className={`${beVietnamPro.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
