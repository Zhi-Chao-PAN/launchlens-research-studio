import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Shared Research Dossier",
  referrer: "no-referrer",
  description:
    "A curated, evidence-backed research dossier shared from LaunchLens Research Studio.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  openGraph: {
    type: "article",
    title: "Shared Research Dossier · LaunchLens",
    description:
      "Open a curated research report and continue the discussion with LaunchLens.",
    siteName: "LaunchLens Research Studio",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "LaunchLens shared research dossier",
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shared Research Dossier · LaunchLens",
    description: "A curated research report shared from LaunchLens Research Studio.",
    images: ["/og.svg"],
  },
};

export default function SharedReportLayout({ children }: { children: ReactNode }) {
  return children;
}
