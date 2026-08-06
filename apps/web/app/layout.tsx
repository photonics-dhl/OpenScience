import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import LocaleSwitcher from "../components/LocaleSwitcher";
import type { Locale } from "../i18n/locale";
import "./globals.css";

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
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <LocaleSwitcher locale={locale} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
