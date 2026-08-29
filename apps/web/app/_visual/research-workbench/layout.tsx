import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Source_Serif_4 } from 'next/font/google';

const readingSerif = Source_Serif_4({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-source-serif',
});

export const metadata: Metadata = {
  title: 'Hermes Research Workbench — Visual Review',
  robots: { follow: false, index: false },
};

export default function ResearchWorkbenchReviewLayout({ children }: { children: ReactNode }) {
  return <div className={readingSerif.variable}>{children}</div>;
}
