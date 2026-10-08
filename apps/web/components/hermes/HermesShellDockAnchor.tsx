'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { HermesDockAnchor } from './HermesDockAnchor';

/**
 * Gives public surfaces without a page-owned Hermes anchor a compact host.
 * The host is collapsed on desktop and only becomes a page-owned compact
 * entry on narrow navigation surfaces.
 */
export function HermesShellDockAnchor({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  return <HermesDockAnchor floating={!inline} onInvoke={() => router.push('/dashboard')} state="idle"
    suggestion={{ kind: 'neutral', bodyKey: 'guide.neutral.body', titleKey: 'guide.neutral.title' }} />;
}
