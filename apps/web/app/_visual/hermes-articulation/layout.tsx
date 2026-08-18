import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = { robots: { follow: false, index: false } };

export default function HermesArticulationHarnessLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_VISUAL_HARNESS !== '1') notFound();
  return children;
}
