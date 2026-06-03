import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Lora } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { ServiceWorkerRegistration } from "@/components/shared/ServiceWorkerRegistration";
import "./globals.css";

// Default UI sans for chrome (public + admin + reader chrome). A modern, clean
// geometric-humanist face. Language-specific reading fonts are loaded per-story
// in Phase 8/9 via lib/i18n/fonts.ts.
const sans = Plus_Jakarta_Sans({
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Qissa",
    template: "%s · Qissa",
  },
  description:
    "A multi-language story translation platform — literary AI translation in the style of legendary writers.",
  applicationName: "Qissa",
  // Tells iOS Safari this is a standalone PWA when installed.
  appleWebApp: {
    capable: true,
    title: "Qissa",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: "Qissa",
    title: "Qissa — Stories, translated with soul",
    description:
      "Literary translations of curated stories into Urdu, Hindi, Bengali, Arabic, Tamil and more.",
    url: APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Qissa",
    description: "Stories, translated with soul.",
  },
};

export const viewport: Viewport = {
  // Matches the manifest theme_color and the PWA address bar.
  themeColor: "#f5d399",
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom — the reader uses it to resize text.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${lora.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistration />
        <InstallPrompt />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
