import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Serif_SC } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import LocaleSwitcher from "../components/LocaleSwitcher";
import type { Locale } from "../i18n/locale";
import "./globals.css";

// Task 3：标题衬线字体，构建期自托管（next/font/google 按 unicode-range 分片，浏览器按需加载）。
// preload: false —— Noto Serif SC 在 next/font 中仅登记 latin 子集，开启 preload 必须指定子集，
// 而指定 latin 会丢掉 CJK 分片；关 preload 后保留全部 unicode-range 分片，浏览器按需加载（简报 Step 4 允许）。
const displaySerif = Noto_Serif_SC({
  weight: ["600", "900"],
  display: "swap",
  variable: "--font-display",
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
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={displaySerif.variable}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <LocaleSwitcher locale={locale} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
