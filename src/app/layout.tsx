import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

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
  "6 specialized AI agents work in parallel to deliver complete market intelligence for your product idea. Market sizing, competitor analysis, pain points, pricing, channels, and synthesis \u2014 all in minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LaunchLens Research Studio \u2014 Multi-Agent Market Intelligence",
    template: "%s | LaunchLens Research Studio",
  },
  description: SITE_DESCRIPTION,
  applicationName: "LaunchLens Research Studio",
  keywords: [
    "market research",
    "AI agents",
    "multi-agent",
    "product launch",
    "GTM",
    "go-to-market",
    "competitive analysis",
    "TAM SAM SOM",
    "LaunchLens",
  ],
  authors: [{ name: "Zhi-Chao PAN", url: "https://github.com/Zhi-Chao-PAN" }],
  creator: "LaunchLens",
  publisher: "LaunchLens",
  category: "productivity",
  classification: "Business Software",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    title: "LaunchLens Research Studio",
    description: SITE_DESCRIPTION,
    siteName: "LaunchLens Research Studio",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "LaunchLens Research Studio \u2014 Multi-Agent Market Intelligence",
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LaunchLens Research Studio",
    description: SITE_DESCRIPTION,
    creator: "@launchlens",
    site: "@launchlens",
    images: ["/og.svg"],
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LaunchLens Research Studio",
    statusBarStyle: "default",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  other: {
    "application/ld+json": JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "LaunchLens Research Studio",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any (Web)",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free demo with mock data; works without API keys.",
      },
      author: {
        "@type": "Person",
        name: "Zhi-Chao PAN",
        url: "https://github.com/Zhi-Chao-PAN",
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <WebVitalsReporter />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
