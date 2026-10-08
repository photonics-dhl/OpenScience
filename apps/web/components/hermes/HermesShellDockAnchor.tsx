'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { HermesDockAnchor } from './HermesDockAnchor';
import { useOptionalHermesWorkspaceStage } from './HermesWorkspaceStage';

/**
 * Gives public surfaces without a page-owned Hermes anchor a compact host.
 * Inline hosts belong to the page composition; the generic shell registration
 * leaves placement to the same compact corner launcher.
 */
export function HermesShellDockAnchor({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const stage = useOptionalHermesWorkspaceStage();
  return <HermesDockAnchor floating={!inline} onInvoke={() => { if (stage) stage.openCompanion(); else router.push('/dashboard'); }} state="idle"
    suggestion={{ kind: 'neutral', bodyKey: 'guide.neutral.body', titleKey: 'guide.neutral.title' }} />;
}
