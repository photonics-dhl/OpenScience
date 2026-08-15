import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Bodoni_Moda,
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  Noto_Serif_SC,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { Locale } from "../i18n/locale";
import "./globals.css";

// next/font downloads at image-build time and serves the files from our own origin.
// The four roles deliberately separate display, editorial, CJK and data voices.
const displayGrotesk = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

const editorialSerif = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bodoni",
  adjustFontFallback: false,
});

const dataMono = IBM_Plex_Mono({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

// Noto Serif SC has no CJK subset flag in next/font's manifest. Disabling preload
// preserves its unicode-range shards so browsers request only the glyphs in use.
const cjkSerif = Noto_Serif_SC({
  weight: ["400", "600", "900"],
  display: "swap",
  variable: "--font-noto-serif-sc",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://OpenScience.428312321.xyz"),
  title: "OpenScience — AI 时代科研基础设施",
  description:
    "OpenScience 是面向 AI 时代的科研基础设施平台：结构化科研对象（Research Object / SDF）、版本化预印本发布与社区评价。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "OpenScience — AI 时代科研基础设施",
    description:
      "结构化科研对象（Research Object / SDF）、版本化预印本发布与社区评价。",
    images: ["/og-image.svg"],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const messages = await getMessages();

  return (
    <html
      suppressHydrationWarning
      lang={locale === "zh" ? "zh-CN" : "en"}
      className={`${displayGrotesk.variable} ${editorialSerif.variable} ${dataMono.variable} ${cjkSerif.variable}`}
    >
      <body>
        {/* Task 9：JS 可用性标记，CSS 滚动进入动效以 html.js 门控（无 JS 时内容始终可见） */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
