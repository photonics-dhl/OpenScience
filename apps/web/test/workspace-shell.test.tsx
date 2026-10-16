import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({ usePathname: () => '/research-objects/ro/edit' }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    outline: 'Outline',
    coreEdit: 'Write & SDF',
    suggestions: 'Evidence & Hermes',
    edit: 'Edit',
    'reading.title': 'Research content',
    'reading.navigation': 'Content chapters',
    'reading.fields.problem': 'Research question',
    'reading.fields.insight': 'Core insight',
    'reading.fields.method': 'Research method',
    'reading.fields.results': 'Main results',
    'reading.fields.limitations': 'Limitations and boundaries',
    'reading.fields.reproducibility': 'Reproducibility',
  })[key] ?? key,
}));

import EditorLayout from '../components/editor/EditorLayout';
import CoreEditor from '../components/editor/CoreEditor';
import { readLocalEditorRepresentation, type LocalEditorRepresentation } from '../components/hermes/HermesAssistantDrawer';
import type { WorkspaceGuidePayload } from '../lib/api';
import { prepareScientificMarkdownSelection, scientificDisplaySelection, withoutInternalSourceMarkers } from '../components/content/ScientificText';
import { SdfFieldContent } from '../components/content/SdfFieldContent';
import ArtifactUploader from '../components/editor/ArtifactUploader';
import { ArtifactRow } from '../components/research/ArtifactRow';
import { ArtifactViewer } from '../components/research/ArtifactViewer';
import { BeforeAfterProposal } from '../components/research/BeforeAfterProposal';
import { EvidenceSnippet } from '../components/research/EvidenceSnippet';
import { ObjectHeader } from '../components/research/ObjectHeader';
import { SDFNode } from '../components/research/SDFNode';

describe('Optical Editorial Research Object workspace', () => {
  beforeAll(() => {
    vi.stubGlobal('React', React);
  });

  it('renders one object header and three stable work planes', () => {
    const markup = renderToStaticMarkup(createElement(EditorLayout, {
      header: createElement(ObjectHeader, {
        objectId: 'OSR-2026-0017',
        title: 'Ultrafast carrier dynamics',
        version: 4,
        visibility: 'private',
        saveState: 'saved',
      }),
      objectId: 'OSR-2026-0017',
      outline: createElement('nav', { 'data-plane-content': 'outline' }, 'Outline'),
      main: createElement('article', { 'data-plane-content': 'sdf' }, 'SDF'),
      aside: createElement('aside', { 'data-plane-content': 'evidence' }, 'Evidence'),
    }));

    expect(markup.match(/<main\b/g)).toHaveLength(1);
    expect(markup.match(/data-object-header=/g)).toHaveLength(1);
    expect(markup).toContain('data-object-context-bar="true"');
    expect(markup).toContain('data-workspace-mode-tabs="true"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).toContain('data-research-workspace-nav="true"');
    expect(markup).toContain('/research-objects/OSR-2026-0017/files');
    expect(markup).toContain('/research-objects/OSR-2026-0017/versions');
    expect(markup).toContain('Ultrafast carrier dynamics');
    expect(markup).toContain('v4');
    expect(markup).toContain('data-workspace-plane="19"');
    expect(markup).toContain('data-workspace-plane="56"');
    expect(markup).toContain('data-workspace-plane="25"');
    expect(markup).toContain('data-mobile-workspace-navigation="true"');
    expect(markup.match(/data-plane-content="outline"/g)).toHaveLength(1);
    expect(markup.match(/data-plane-content="sdf"/g)).toHaveLength(1);
    expect(markup.match(/data-plane-content="evidence"/g)).toHaveLength(1);
  });

  it('renders six numbered SDF nodes with vermilion reserved for the active node', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderToStaticMarkup(createElement(
      SDFNode,
      {
        active: index === 2,
        label: `Field ${index + 1}`,
        number: index + 1,
        onActivate: () => undefined,
      },
      createElement('p', null, 'Evidence-backed content'),
    ))).join('');

    expect(markup.match(/data-sdf-node=/g)).toHaveLength(6);
    expect(markup.match(/data-active-vermilion="true"/g)).toHaveLength(1);
    expect(markup).toContain('>06<');
  });

  it('keeps evidence collapsible and proposals explicit about source and scope', () => {
    const evidence = renderToStaticMarkup(createElement(EvidenceSnippet, {
      label: 'Source evidence',
      source: 'manuscript.pdf · p. 12',
      children: 'The measured lifetime was 43 fs.',
    }));
    const proposal = renderToStaticMarkup(createElement(BeforeAfterProposal, {
      before: 'Lifetime was short.',
      after: 'The measured lifetime was 43 fs.',
      source: 'Hermes extractor · manuscript.pdf',
      scope: 'Results / paragraph 2',
      onReview: () => undefined,
      risk: 'high',
    }));

    expect(evidence).toContain('<details');
    expect(evidence).toContain('manuscript.pdf · p. 12');
    expect(proposal).toContain('data-proposal-source=');
    expect(proposal).toContain('data-proposal-scope=');
    expect(proposal).toContain('data-risk="high"');
    expect(proposal).not.toContain('suggestion-card');
    const proposalSource = readFileSync(new URL('../components/research/BeforeAfterProposal.tsx', import.meta.url), 'utf8');
    expect(proposalSource).toContain('@/components/ui/dialog');
    expect(proposalSource).toContain('<DialogContent');
    expect(proposalSource).toContain('inset-0');
  });

  it('presents artifacts as rule-based rows instead of cards', () => {
    const markup = renderToStaticMarkup(createElement(ArtifactRow, {
      name: 'manuscript.pdf',
      status: 'ready',
      meta: 'PDF · primary manuscript',
    }));
    expect(markup).toContain('data-artifact-row="true"');
    expect(markup).not.toMatch(/card|rounded-(?:xl|2xl|3xl)/);
  });

  it('keeps long research titles available and announces save feedback', () => {
    const markup = renderToStaticMarkup(createElement(ObjectHeader, {
      objectId: 'private-id', title: 'A long research title with a mathematical contribution',
      version: 4, visibility: 'private', saveState: 'saving',
    }));
    expect(markup).not.toContain('truncate');
    expect(markup).not.toContain('private-id');
    expect(markup).toMatch(/data-save-state="saving" role="status"/);
  });

  it('offers heading edit controls for all six passages without visible section numbers', () => {
    const core = { schemaVersion: '0.1.0', problem: '$E=mc^2$ [S12]', insight: '', method: '', results: '', limitations: '', reproducibility: '' };
    const props = { core, activeField: null, onEdit: () => undefined, onSelectField: () => undefined };
    const editable = renderToStaticMarkup(createElement(CoreEditor, props));
    const reading = renderToStaticMarkup(createElement(CoreEditor, { ...props, readOnly: true }));
    expect(editable.match(/<h2[^>]*>[\s\S]*?<button/g)).toHaveLength(6);
    expect(editable).toContain('data-sdf-math-display="true"');
    expect(editable).not.toContain('[S12]');
    expect(editable).not.toMatch(/>0[1-6]</);
    expect(reading).not.toContain('<button');
    expect(reading.match(/data-read-only="true"/g)).toHaveLength(6);
  });

  it('starts the opted-in content as six readable sections with working chapter targets', () => {
    const core = { schemaVersion: '0.1.0', problem: '$E=mc^2$ [S12]', insight: 'Shared contribution', method: 'Method', results: 'Results', limitations: 'Limits', reproducibility: 'Protocol' };
    const onEdit = vi.fn();
    const markup = renderToStaticMarkup(createElement(CoreEditor, {
      core, activeField: 'problem', onEdit, onSelectField: () => undefined, readFirst: true, chapterNavigation: true,
    }));
    expect(markup).toContain('Research content</h2>');
    expect(markup).toContain('aria-label="Content chapters"');
    expect(markup.match(/<h3\b/g)).toHaveLength(6);
    for (const field of ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']) {
      expect(markup).toContain(`href="#research-section-${field}"`);
      expect(markup).toContain(`id="research-section-${field}"`);
    }
    expect(markup.match(/aria-current="location"/g)).toHaveLength(1);
    expect(markup.match(/<button\b/g)).toHaveLength(6);
    expect(markup).toContain('aria-label="Research question · Edit"');
    expect(markup).toContain('class="katex"');
    expect(markup).not.toContain('[S12]');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('role="button"');
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('keeps contribution reading focused on the same insight without a chapter menu', () => {
    const markup = renderToStaticMarkup(createElement(CoreEditor, {
      core: { schemaVersion: '0.1.0', problem: 'Question', insight: 'Shared contribution', method: '', results: '', limitations: '', reproducibility: '' },
      activeField: 'problem', onEdit: () => undefined, onSelectField: () => undefined,
      readFirst: true, fields: ['insight'], headingLabels: { insight: 'Core contribution' },
    }));
    expect(markup).toContain('Core contribution</h2>');
    expect(markup).toContain('Shared contribution');
    expect(markup).toContain('aria-label="Core contribution · Edit"');
    expect(markup.match(/<section\b/g)).toHaveLength(1);
    expect(markup).not.toContain('<nav');
    expect(markup).not.toContain('<textarea');
    expect(markup).not.toContain('Research content</h2>');
  });

  it('keeps opted-in ingestion review non-editable while retaining chapter navigation', () => {
    const markup = renderToStaticMarkup(createElement(CoreEditor, {
      core: { schemaVersion: '0.1.0', problem: 'Question', insight: 'Insight', method: '', results: '', limitations: '', reproducibility: '' },
      activeField: null, onEdit: () => undefined, onSelectField: () => undefined,
      readFirst: true, chapterNavigation: true, readOnly: true,
    }));
    expect(markup).toContain('aria-label="Content chapters"');
    expect(markup.match(/data-read-only="true"/g)).toHaveLength(6);
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<textarea');
  });

  it('reads explicit formatted snapshots with author edit controls', () => {
    const core = { schemaVersion: '0.2.0', problem: 'Question', insight: '**Finding** and *qualification*\n\n- First\n- Second\n\n[Source](https://example.org) $E=mc^2$ [S12]', method: '**Literal method**', results: '', limitations: '', reproducibility: '', fieldFormats: { insight: 'markdown' as const } };
    const markup = renderToStaticMarkup(createElement(CoreEditor, { core, activeField: 'insight', onEdit: vi.fn(), onSelectField: vi.fn(), readFirst: true }));
    const semantic = markup.replace(/<\/?span\b[^>]*>/g, '');
    expect(semantic).toContain('<strong>Finding</strong>');
    expect(semantic).toContain('<em>qualification</em>');
    expect(semantic).toContain('<li>First</li>');
    expect(markup).toContain('href="https://example.org"');
    expect(markup).toContain('class="katex"');
    expect(markup).not.toContain('[S12]');
    expect(markup).toContain('**Literal method**');
    expect(markup).not.toContain('<textarea');
    expect(markup).toContain('<button');
  });

  it('leaves legacy same-map markup literal and neutralizes invalid or unsafe new content', () => {
    const body = '**Finding** <script>bad()</script> ![hidden](https://example.org/x.png) [unsafe](javascript:alert(1))';
    const legacy = { schemaVersion: '0.1.0', problem: '', insight: body, method: '', results: '', limitations: '', reproducibility: '', fieldFormats: { insight: 'markdown' } };
    const plain = renderToStaticMarkup(createElement(SdfFieldContent, { core: legacy, field: 'insight' }));
    expect(plain).toContain('**Finding**');
    expect(plain).not.toContain('<strong>');
    const formatted = renderToStaticMarkup(createElement(SdfFieldContent, { core: { ...legacy, schemaVersion: '0.2.0' }, field: 'insight' }));
    expect(formatted.replace(/<\/?span\b[^>]*>/g, '')).toContain('<strong>Finding</strong>');
    expect(formatted).not.toMatch(/<script|<img|href="javascript:/);
    const invalid = renderToStaticMarkup(createElement(SdfFieldContent, { core: { ...legacy, schemaVersion: '0.2.0', fieldFormats: { insight: 'unknown' } }, field: 'insight' }));
    expect(invalid).toContain('**Finding**');
    expect(invalid).not.toContain('<strong>');
  });

  it('keeps upload format details secondary and gives preview actions touch targets', () => {
    const uploader = renderToStaticMarkup(createElement(ArtifactUploader, {
      workspaceId: 'workspace', researchObjectId: 'ro', artifacts: [], onArtifactsChange: () => undefined,
    }));
    const viewer = renderToStaticMarkup(createElement(ArtifactViewer, { artifactId: 'artifact', logicalPath: 'paper.pdf' }));
    expect(uploader).toContain('<details');
    expect(uploader).toContain('focus-within:outline');
    expect(uploader).toContain('aria-busy="false"');
    expect(viewer).toContain('/api/artifacts/artifact/download');
    expect(viewer.match(/min-h-11/g)).toHaveLength(2);
  });
});

describe('first formatting keeps untouched scientific prose literal',()=>{
  it('preserves literal markup, HTML and formula when only the last word is made bold',()=>{
    const text=String.raw`literal **x** [y] <b>hello</b> \(x+y\) final`;
    const selected=prepareScientificMarkdownSelection(text,text.indexOf('final'),text.length)!;
    const changed=selected.value.slice(0,selected.start)+'**'+selected.value.slice(selected.start,selected.end)+'**';
    const core={schemaVersion:'0.2.0',problem:'',insight:changed,method:'',results:'',limitations:'',reproducibility:'',fieldFormats:{insight:'markdown'}};
    const html=renderToStaticMarkup(createElement(SdfFieldContent,{core,field:'insight'}));
    expect(html).toContain('literal **x** [y] &lt;b&gt;hello&lt;/b&gt;');
    expect(html).toMatch(/<strong>(?:<span[^>]*>)?final/);
    expect(html).toContain('katex');
    expect(html).not.toContain('<strong>x</strong>');
  });
  it('refuses a selection inside a formula',()=>{
    const text=String.raw`word \(x+y\) tail`;
    expect(prepareScientificMarkdownSelection(text,text.indexOf('x'),text.indexOf('y')+1)).toBeNull();
  });
});

it('maps a visible formatting selection onto raw source without deleting hidden source tokens',()=>{
  const raw=String.raw`Evidence [S12] \(x+y\) final`;
  const display=raw.replace('[S12]','');
  const selected=prepareScientificMarkdownSelection(raw,display.indexOf('final'),display.length,false,true)!;
  const value=selected.value.slice(0,selected.start)+'**'+selected.value.slice(selected.start,selected.end)+'**'+selected.value.slice(selected.end);
  expect(value).toContain('[S12]');
  const core={schemaVersion:'0.2.0',problem:'',insight:value,method:'',results:'',limitations:'',reproducibility:'',fieldFormats:{insight:'markdown'}};
  const html=renderToStaticMarkup(createElement(SdfFieldContent,{core,field:'insight'}));
  expect(html).toMatch(/<strong>(?:<span[^>]*>)?final/);
  expect(html).not.toContain('S12');
  expect(html).toContain('katex');
});

it('keeps format custody in the same local submit and refuses another owner, recovered receipt or task on the same cell',()=>{
  const payload:WorkspaceGuidePayload={goal:'Review this research',locale:'en',route:'research-object-edit',target:null,context:{tasks:[],researchObjects:[]}};
  const core={schemaVersion:'0.2.0',problem:'P',insight:'I',method:'M',results:'R',limitations:'L',reproducibility:'RP',fieldFormats:{insight:'markdown'}};
  const cell:{current:LocalEditorRepresentation|undefined}={current:{owner:'actorA:ro',payload,core}};
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{payload})).toBe(core);
  // Same cell, no remount: another session or parsed durable body has no capture.
  expect(readLocalEditorRepresentation(cell.current,'actorB:ro',{payload})).toBeUndefined();
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{payload:structuredClone(payload)})).toBeUndefined();
  cell.current={...cell.current!,taskId:'local-task'};
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{taskId:'local-task'})).toBe(core);
  expect(readLocalEditorRepresentation(cell.current,'actorB:ro',{taskId:'local-task'})).toBeUndefined();
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{taskId:'restored-task'})).toBeUndefined();
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{payload})).toBeUndefined();
  cell.current=undefined;
  expect(readLocalEditorRepresentation(cell.current,'actorA:ro',{taskId:'local-task'})).toBeUndefined();
});

it('keeps the selected word when raw formatting boundaries cross an unseen source marker',()=>{
  const raw='Evidence&#32;[S12]&#32;**final**';
  expect(raw.length).toBe(32);expect(withoutInternalSourceMarkers(raw).length).toBe(27);
  expect(scientificDisplaySelection(raw,25,30)).toEqual({start:20,end:25});
  const range=scientificDisplaySelection(raw,25,30);
  expect(withoutInternalSourceMarkers(raw).slice(range.start,range.end)).toBe('final');
  const next=prepareScientificMarkdownSelection(raw,range.start,range.end,true,true)!;
  expect(next.value.slice(next.start,next.end)).toBe('final');
  const previous='Evidence [S12] final';
  expect(scientificDisplaySelection(previous,15,20)).toEqual({start:10,end:15});
});

it('maps consecutive italic and link label ranges while preserving math and source IDs',()=>{
  let raw='Evidence&#32;[S12]&#32;**final**';
  let display=scientificDisplaySelection(raw,25,30);
  const italic=prepareScientificMarkdownSelection(raw,display.start,display.end,true,true)!;
  raw=raw.slice(0,italic.start)+'*'+raw.slice(italic.start,italic.end)+'*'+raw.slice(italic.end);
  display=scientificDisplaySelection(raw,italic.start+1,italic.end+1);
  expect(withoutInternalSourceMarkers(raw).slice(display.start,display.end)).toBe('final');
  const link=prepareScientificMarkdownSelection(raw,display.start,display.end,true,true)!;
  const label=raw.slice(link.start,link.end);
  raw=raw.slice(0,link.start)+'['+label+'](<https://example.org>)'+raw.slice(link.end);
  display=scientificDisplaySelection(raw,link.start+1,link.start+1+label.length);
  expect(withoutInternalSourceMarkers(raw).slice(display.start,display.end)).toBe('final');
  expect(raw).toContain('[S12]');
  const math=String.raw`Evidence \(x+[S12]\) [S3] final`;
  const selection=scientificDisplaySelection(math,math.indexOf('final'),math.length);
  expect(withoutInternalSourceMarkers(math).slice(selection.start,selection.end)).toBe('final');
  expect(withoutInternalSourceMarkers(math)).toContain('[S12]');
});
