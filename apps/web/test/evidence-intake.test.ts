import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'roles.manuscript': 'Manuscript',
    'roles.figure': 'Figure',
    'roles.data': 'Data',
    'roles.code': 'Code',
    'roles.supplement': 'Supplement',
    'primary': 'Primary manuscript',
    'remove': 'Remove',
    'retry': 'Retry',
    'status.local': 'Local only',
    'status.parsing': 'Parsing evidence',
    'status.needs_review': 'Needs review',
    'stage.scan': 'Scan',
    'stage.upload': 'Upload',
    'stage.parse': 'Parse / OCR',
    'stage.map': 'SDF map',
    'stage.review': 'Review',
  }[key] ?? key),
}));

import {
  createIntakeMaterials,
  setPrimaryMaterial,
  updateMaterialFromTask,
} from '../components/intake/intake-model';
import { IngestionProgress } from '../components/intake/IngestionProgress';
import { MaterialQueue } from '../components/intake/MaterialQueue';

function material(name: string, type = ''): File {
  return new File(['research evidence'], name, { type });
}

describe('mixed-material evidence intake model', () => {
  it('classifies manuscript, figure, data and code while keeping files local', () => {
    const rows = createIntakeMaterials([
      material('paper.pdf', 'application/pdf'),
      material('latex-source.zip', 'application/zip'),
      material('figure.png', 'image/png'),
      material('measurements.csv', 'text/csv'),
      material('analysis.ipynb', 'application/x-ipynb+json'),
      material('fit.py', 'text/x-python'),
    ]);

    expect(rows.map(({ role }) => role)).toEqual(['manuscript', 'manuscript', 'figure', 'data', 'code', 'code']);
    expect(rows.every((row) => row.status === 'local' && row.progress === 0)).toBe(true);
    expect(rows.every((row) => row.artifactId === undefined && row.taskId === undefined)).toBe(true);
  });

  it('allows no primary manuscript and enforces at most one primary when selected', () => {
    const rows = createIntakeMaterials([material('paper.md'), material('appendix.docx')]);
    expect(rows.filter(({ primary }) => primary)).toHaveLength(0);

    const first = setPrimaryMaterial(rows, rows[0].localId);
    const second = setPrimaryMaterial(first, rows[1].localId);
    expect(second.filter(({ primary }) => primary).map(({ file }) => file.name)).toEqual(['appendix.docx']);
    expect(setPrimaryMaterial(second, null).filter(({ primary }) => primary)).toHaveLength(0);
  });

  it('maps only real server task states and preserves retry/review outcomes', () => {
    const [row] = createIntakeMaterials([material('scan.pdf')]);
    const parsing = updateMaterialFromTask(row, {
      id: 'task-1', artifactId: 'artifact-1', logicalPath: 'scan.pdf', state: 'parsing', error: null,
    });
    expect(parsing).toMatchObject({ status: 'parsing', progress: 70, taskId: 'task-1', artifactId: 'artifact-1' });

    expect(updateMaterialFromTask(parsing, { ...parsing, id: 'task-1', logicalPath: 'scan.pdf', state: 'needs_review', error: null }))
      .toMatchObject({ status: 'needs_review', progress: 90 });
    expect(updateMaterialFromTask(parsing, { ...parsing, id: 'task-1', logicalPath: 'scan.pdf', state: 'failed_retryable', error: 'OCR unavailable' }))
      .toMatchObject({ status: 'failed_retryable', progress: 70, errorCode: 'OCR unavailable' });
  });

  it('renders role, optional primary, retry, and review controls without generic cards', () => {
    const [base, second] = createIntakeMaterials([material('paper.pdf'), material('appendix.pdf')]);
    const failed = { ...second, status: 'failed_retryable' as const, progress: 70, errorCode: 'OCR unavailable', taskId: 'task-2' };
    const markup = renderToStaticMarkup(createElement(MaterialQueue, {
      materials: [base, failed],
      onRoleChange: () => undefined,
      onPrimaryChange: () => undefined,
      onRemove: () => undefined,
      onRetry: () => undefined,
    }));
    expect(markup).toContain('paper.pdf');
    expect(markup).toContain('Primary manuscript');
    expect(markup).toContain('Retry');
    expect(markup).toContain('data-material-row');
    expect(markup).not.toContain('rounded-card');
  });

  it('shows the fixed evidence pipeline with semantic progress', () => {
    const markup = renderToStaticMarkup(createElement(IngestionProgress, { status: 'needs_review', progress: 90 }));
    for (const label of ['Scan', 'Upload', 'Parse / OCR', 'SDF map', 'Review']) expect(markup).toContain(label);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="90"');
    expect(markup).toContain('data-current-stage="review"');
  });
});
