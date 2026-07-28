import type { ReactNode } from "react";

export const metadata = {
  title: "OpenScience",
  description: "OpenScience web placeholder",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
