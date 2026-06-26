import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { CommandPaletteProvider } from "@/components/command-palette/CommandPaletteContext";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { GlobalCommands } from "@/components/command-palette/GlobalCommands";
import { ToastProvider } from "@/components/toast/ToastContext";
import { NetworkStatus } from "@/components/ui/NetworkStatus";
import { KeyboardCheatsheetGlobal } from "@/components/keyboard/KeyboardCheatsheetGlobal";
import { FreezeMode } from "@/components/perf/FreezeMode";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { resolveLocaleFromHeaders } from "@/lib/i18n/server";

// Use system fonts instead of Google Fonts for better compatibility in China
const fontClasses = "font-sans";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light dark",
};

const SITE_URL = "https://research.launchlens.ai";
const SITE_DESCRIPTION =
  "LaunchLens Research Studio - Multi-agent market intelligence for your product idea. AI agents synthesize professional market research reports in minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LaunchLens Research Studio",
    template: "%s | LaunchLens",
  },
  description: SITE_DESCRIPTION,
  applicationName: "LaunchLens Research Studio",
  keywords: [
    "market research",
    "competitor analysis",
    "AI research",
    "pricing intelligence",
    "go-to-market",
    "launch strategy",
  ],
  authors: [{ name: "LaunchLens Team" }],
  creator: "LaunchLens Research Studio",
  publisher: "LaunchLens Research Studio",
  category: "productivity",
  classification: "Developer Tools",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    title: "LaunchLens Research Studio",
    description: SITE_DESCRIPTION,
    siteName: "LaunchLens Research Studio",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "LaunchLens Research Studio",
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LaunchLens Research Studio",
    description: SITE_DESCRIPTION,
    images: ["/og.svg"],
    creator: "@launchlens",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // R203: derive the SSR <html lang> from Accept-Language instead of
  // hardcoding "zh-CN". The client LocaleProvider refines from localStorage
  // on mount, but the SSR value is what crawlers and no-JS clients see.
  const hdrs = await headers();
  const ssrLocale = resolveLocaleFromHeaders(hdrs);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "LaunchLens Research Studio",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    inLanguage: ["en", "zh-CN", "ja", "ko"],
    browserRequirements: "Requires JavaScript. Requires HTML5.",
  };
  return (
    <html lang={ssrLocale} className={`${fontClasses} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50">
        <script
          type="application/ld+json"
          // JSON-LD is a static schema.org object; safe to inject verbatim.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ErrorBoundary>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <WebVitalsReporter />
            <LocaleProvider>
              <ToastProvider>
                <CommandPaletteProvider>
                  <a href="#main-content" className="skip-link">
                    Skip to content
                  </a>
                  {children}
                  <CommandPalette />
                  <GlobalCommands />
                  <NetworkStatus />
                  <KeyboardCheatsheetGlobal />
                </CommandPaletteProvider>
              </ToastProvider>
            </LocaleProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
