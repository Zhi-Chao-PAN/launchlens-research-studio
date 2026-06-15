import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: {
    default: "LaunchLens Research Studio ? Multi-Agent Market Intelligence",
    template: "%s | LaunchLens Research Studio",
  },
  description:
    "6 specialized AI agents work in parallel to deliver complete market intelligence for your product idea. Market sizing, competitor analysis, pain points, pricing, channels, and synthesis ? all in minutes.",
  keywords: [
    "market research",
    "AI agents",
    "multi-agent",
    "product launch",
    "GTM",
    "go-to-market",
    "competitive analysis",
    "LaunchLens",
  ],
  authors: [{ name: "Zhi-Chao PAN" }],
  creator: "LaunchLens",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://research.launchlens.ai",
    title: "LaunchLens Research Studio",
    description:
      "Multi-agent market intelligence for your product idea. Powered by 6 specialized AI research agents.",
    siteName: "LaunchLens Research Studio",
  },
  twitter: {
    card: "summary_large_image",
    title: "LaunchLens Research Studio",
    description:
      "Multi-agent market intelligence for your product idea. Powered by 6 specialized AI research agents.",
    creator: "@launchlens",
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: true,
    follow: true,
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
