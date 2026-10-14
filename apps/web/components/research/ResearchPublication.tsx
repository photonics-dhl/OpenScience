'use client';

import { ResearchPublicationPanel, type ResearchPublicationProps } from './ResearchPublicationPanel';
import { ResearchSurfaceShell } from './ResearchSurfaceShell';

export function ResearchPublication(props: ResearchPublicationProps) {
  return <ResearchPublicationPanel {...props} renderSurface={(object, content) => <ResearchSurfaceShell active="publish" object={object}>{content}</ResearchSurfaceShell>} />;
}
