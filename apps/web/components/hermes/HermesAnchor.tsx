'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';

import type { HermesAnchorAction, HermesAnchorId } from '@/lib/hermes/anchor-registry';
import type { HermesDockSide } from '@/lib/hermes/travel-path';

import { useOptionalHermesWorkspaceStage } from './HermesWorkspaceStage';

const DEFAULT_ACTIONS: HermesAnchorAction[] = ['explain', 'draft', 'check'];
const DEFAULT_SIDES: HermesDockSide[] = ['right', 'top'];

export function HermesAnchor({ actions = DEFAULT_ACTIONS, children, id, sides = DEFAULT_SIDES }: {
  actions?: HermesAnchorAction[];
  children: React.ReactNode;
  id: HermesAnchorId;
  sides?: HermesDockSide[];
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const stage = useOptionalHermesWorkspaceStage();
  useEffect(() => stage?.registerAnchor({ actions, clearancePx: 16, element: () => elementRef.current, id, sides }), [actions, id, sides, stage]);
  return (
    <div
      data-hermes-anchor={id}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) stage?.setWriting(false); }}
      onFocusCapture={() => stage?.setWriting(true)}
      ref={elementRef}
    >
      {children}
    </div>
  );
}
