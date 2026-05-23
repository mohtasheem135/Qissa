import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

// Default UI sans for chrome (admin + reader chrome). Language-specific reading
// fonts are loaded per-story in Phase 8/9 via lib/i18n/fonts.ts.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Default reader serif for English; per-language serifs override in Phase 9.
const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Qissa",
    template: "%s · Qissa",
  },
  description:
    "A multi-language story translation platform — literary AI translation in the style of legendary writers.",
  applicationName: "Qissa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
