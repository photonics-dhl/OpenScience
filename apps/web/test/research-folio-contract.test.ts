import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('Research Folio product system', () => {
  it('loads the promised reading serif as a real global font variable', () => {
    const layout = source('../app/layout.tsx');
    expect(layout).toContain('Source_Serif_4');
    expect(layout).toContain('--font-source-serif');
  });

  it('uses folio surfaces for the three product shells', () => {
    const identity = source('../components/shell/IdentityShell.tsx');
    const dashboard = source('../components/shell/DashboardShell.tsx');
    const workspace = source('../components/shell/WorkspaceShell.tsx');

    expect(identity).toContain('surface-folio');
    expect(dashboard).toContain('surface-folio');
    expect(workspace).toContain('surface-folio');
    expect(identity).not.toContain('surface-workbench');
    expect(dashboard).not.toContain('surface-workbench');
    expect(workspace).not.toContain('surface-workbench');
  });

  it('keeps Landing independent from the product folio shell', () => {
    const landing = source('../app/page.tsx');
    expect(landing).not.toContain('surface-folio');
    expect(landing).not.toContain('IdentityShell');
    expect(landing).not.toContain('DashboardShell');
    expect(landing).not.toContain('WorkspaceShell');
  });

  it('defines semantic paper and graphite roles without gradients or glass', () => {
    const globals = source('../app/globals.css');
    expect(globals).toContain('.surface-folio');
    expect(globals).toContain('.surface-folio-sheet');
    expect(globals).toContain('.surface-graphite-tool');
    expect(globals).not.toMatch(/\.surface-folio[^}]*gradient/is);
    expect(globals).not.toMatch(/\.surface-folio[^}]*backdrop-filter/is);
  });

  it('renders anchored Hermes in page-owned space and reserves fixed positioning for detachment', () => {
    const stage = source('../components/hermes/HermesWorkspaceStage.tsx');
    const anchor = source('../components/hermes/HermesDockAnchor.tsx');
    const surface = source('../components/research/ResearchSurfaceShell.tsx');
    expect(stage).toContain('data-hermes-placement={anchored ? \'anchored\' : \'detached\'}');
    expect(anchor).toContain('data-hermes-companion-margin="true"');
    expect(anchor).not.toContain('aria-hidden="true"');
    expect(surface).toContain('<HermesDockAnchor');
    expect(surface).toContain('<HermesAssistantDrawer');
  });

  it('keeps touch long press and drag under one pointer-capture boundary', () => {
    const stage = source('../components/hermes/HermesWorkspaceStage.tsx');
    const adapter = source('../components/hermes/HermesVisualAdapter.tsx');
    expect(stage).toContain("if (event.pointerType !== 'touch') event.currentTarget.setPointerCapture(event.pointerId)");
    expect(stage).toContain('Math.hypot(dx, dy) > 10');
    expect(stage).toContain('if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId)');
    expect(stage).toContain('return presentation?.anchor ? createPortal(stageElement, presentation.anchor) : stageElement');
    expect(adapter).toContain('router.push(href)');
    expect(adapter).not.toContain('window.location.assign');
    expect(stage).toContain('menuFeedbackTimerRef');
    expect(stage).toContain('setMenuFeedback(true)');
    expect(adapter).toContain('meshInputRef.current.action = action');
    expect(adapter).not.toContain('ignoreQuietActionChangeRef');
    expect(adapter).not.toContain('scrollIntoView');
  });

  it('keeps editor Hermes actions inside the current research object workflow', () => {
    const editor = source('../app/research-objects/[id]/edit/page.tsx');
    expect(editor).toContain('researchObjectId: roId');
    expect(editor).toContain('`/research-objects/${encodeURIComponent(roId)}/edit`');
  });
});
