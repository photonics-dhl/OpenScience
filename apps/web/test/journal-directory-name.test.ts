import { describe, expect, it } from 'vitest';
import { directoryName, selectDirectory, type DirectoryRecord } from '../lib/journal-workbench-model';
import type { JournalSummary } from '../lib/journal-api';

const base: DirectoryRecord = { id: 'a', subjects: [], publicArticleCount: 0 };

describe('nullable journal names from the public API', () => {
  it.each([
    [{ ...base, nameEn: 'Optics', nameZh: null }, 'Optics'],
    [{ ...base, nameEn: null, nameZh: '光学' }, '光学'],
    [{ ...base, nameEn: '  ', nameZh: ' 光学 ' }, '光学'],
    [{ ...base, nameEn: null, nameZh: null }, 'Unnamed journal'],
    [base, 'Unnamed journal'],
  ] as const)('normalizes %j to a non-null display label', (journal, expected) => {
    expect(directoryName(journal)).toBe(expected);
  });

  it('accepts API records with an omitted Chinese name and sorts without mutation', () => {
    const items: JournalSummary[] = [
      { id: 'b', slug: 'unnamed', subjects: [], publicArticleCount: 0, homepagePublished: true, status: 'active' },
      { id: 'a', slug: 'optics', nameEn: 'Optics', nameZh: null, subjects: [], publicArticleCount: 0, homepagePublished: true, status: 'active' },
    ];
    const result = selectDirectory(items, { query: '', subject: '', access: 'all', sort: 'az' });
    expect(result.map((item) => item.id)).toEqual(['a', 'b']);
    expect(items.map((item) => item.id)).toEqual(['b', 'a']);
    expect(items[0]?.nameZh).toBeUndefined();
  });
});
