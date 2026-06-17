import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WebVitalsReporter } from "@/components/perf/WebVitalsReporter";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { CommandPaletteProvider } from "@/components/command-palette/CommandPaletteContext";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { GlobalCommands } from "@/components/command-palette/GlobalCommands";
import { ToastProvider } from "@/components/toast/ToastContext";
import { NetworkStatus } from "@/components/ui/NetworkStatus";
import { KeyboardCheatsheetGlobal } from "@/components/keyboard/KeyboardCheatsheetGlobal";

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
  "AI 辅助的大模型评估工作台 — 输入任务，上传看板和产物，AI 帮你生成专业评估报告。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ModelEval Studio · AI 模型评估工作台",
    template: "%s | ModelEval Studio",
  },
  description: SITE_DESCRIPTION,
  applicationName: "ModelEval Studio",
  keywords: [
    "模型评估",
    "大模型测试",
    "AI 评估",
    "多模型对比",
    "模型测试",
    "评估助手",
  ],
  authors: [{ name: "ModelEval Team" }],
  creator: "ModelEval Studio",
  publisher: "ModelEval Studio",
  category: "productivity",
  classification: "Developer Tools",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    title: "ModelEval Studio · AI 模型评估工作台",
    description: SITE_DESCRIPTION,
    siteName: "ModelEval Studio",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "ModelEval Studio",
        type: "image/svg+xml",
      },
    ],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${fontClasses} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50">
        <WebVitalsReporter />
        <LocaleProvider>
          <ToastProvider>
            <CommandPaletteProvider>
              <a href="#main-content" className="skip-link">
                跳转到主要内容
              </a>
              {children}
              <CommandPalette />
              <GlobalCommands />
              <NetworkStatus />
              <KeyboardCheatsheetGlobal />
            </CommandPaletteProvider>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
