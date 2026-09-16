import type { PublicClaim, PublicEvidence } from '../../lib/api';
import { scientificProseForMatching, withoutInternalSourceMarkers } from '../content/ScientificText';

// Older reviewed-note imports included an operational preface in the claim.
// Remove only that complete, recognized preface from reading; keep the record intact.
export function claimReadingBody(statement: string) {
  return statement.replace(/^制作依据：已核对科研笔记 [0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}；以下正文原样转入，引用编号与该笔记一致。\s*/iu, '');
}

/** Reuse an authored heading when present; never invent a scientific summary. */
export function claimReadingTitle(body: string) {
  const firstLine = withoutInternalSourceMarkers(body).trimStart().split('\n')[0];
  const heading = firstLine.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/u)
    ?? firstLine.match(/^\*\*(.+)\*\*\s*$/u);
  return heading?.[1] ?? '';
}

export function evidenceReadingTitle(evidence: PublicEvidence) {
  return sourceMarker(evidence.title) || evidenceField(evidence.title) ? '' : evidence.title;
}

export const readingFields = ['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility'] as const;
type ReadingField = typeof readingFields[number];

function evidenceField(title: string): ReadingField | undefined {
  const field = title.trim().match(/^(problem|insight|method|results|limitations|reproducibility)(?: extraction quote)?$/u)?.[1];
  return field as ReadingField | undefined;
}

function sourceMarker(title: string) {
  return title.trim().match(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\s+\[?(S\d{1,4})\]?$/iu)?.[1];
}

export function claimReadingField(claim: PublicClaim, evidence: PublicEvidence[]) {
  const fields = new Set(evidence.filter(item => item.claimId === claim.id).map(item => evidenceField(item.title)).filter((field): field is ReadingField => Boolean(field)));
  return fields.size === 1 ? [...fields][0] : undefined;
}

/** A reading projection of existing Markdown sections, never new scientific claims. */
export function claimReadingSections(statement: string, evidence: PublicEvidence[]) {
  const body = claimReadingBody(statement);
  // Reference definitions can be used by another section. Keep that document whole.
  if (/^ {0,3}\[[^\]\r\n]+\]:/mu.test(body)) return { sections: [{ title: '', body, evidence }], remaining: [] as PublicEvidence[] };
  const noteId = statement.match(/^制作依据：已核对科研笔记 ([0-9a-f-]{36})；/iu)?.[1];
  const namespaces = new Set(evidence.filter(item => sourceMarker(item.title)).map(item => item.title.trim().split(/\s/u)[0]));
  const headings: Array<{ offset: number; level: number; title: string }> = [];
  let offset = 0;
  let fence = '';
  let math = '';
  for (const line of scientificProseForMatching(body).split('\n')) {
    const originalLine = body.slice(offset, offset + line.length);
    const opening = originalLine.match(/^ {0,3}(`{3,}|~{3,})([^\n]*)$/u);
    if (fence) {
      const closing = originalLine.match(/^ {0,3}(`{3,}|~{3,})[\t \r]*$/u)?.[1];
      if (closing && closing[0] === fence[0] && closing.length >= fence.length) fence = '';
    } else if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
      fence = opening[1];
    } else {
      if (/^\s*\$\$\s*$/u.test(line)) math = math === '$$' ? '' : '$$';
      else if (/^\s*\\\[\s*$/u.test(line)) math = '\\[';
      else if (/^\s*\\\]\s*$/u.test(line)) math = '';
      else if (!math) {
        const heading = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u);
        if (heading) {
          const title = originalLine.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/u)?.[2] ?? heading[2];
          headings.push({ offset, level: heading[1].length, title });
        }
      }
    }
    offset += line.length + 1;
  }
  const level = Math.min(...headings.map(heading => heading.level));
  const boundaries = headings.filter(heading => heading.level === level);
  if (boundaries.length < 2) return { sections: [{ title: '', body, evidence }], remaining: [] as PublicEvidence[] };
  if (boundaries[0].offset > 0) boundaries.unshift({ offset: 0, level, title: '' });
  const used = new Set<string>();
  const sections = boundaries.map((heading, index) => {
    const sectionBody = body.slice(heading.offset, boundaries[index + 1]?.offset ?? body.length);
    const markers = new Set([...scientificProseForMatching(sectionBody).matchAll(/\[(S\d{1,4})\]/gu)].map(match => match[1]));
    const linked = evidence.filter(item => {
      const marker = sourceMarker(item.title);
      const sameNote = noteId ? item.title.trim().toLowerCase().startsWith(`${noteId.toLowerCase()} `) : namespaces.size === 1;
      return sameNote && marker !== undefined && markers.has(marker);
    });
    linked.forEach(item => used.add(item.id));
    // The authored heading appears once in the disclosure summary; retain its exact body suffix.
    const headingEnd = sectionBody.indexOf('\n');
    const readingBody = heading.title ? sectionBody.slice(headingEnd < 0 ? sectionBody.length : headingEnd + 1) : sectionBody;
    return { title: heading.title, body: readingBody, evidence: linked };
  });
  return { sections, remaining: evidence.filter(item => !used.has(item.id)) };
}

export function groupEvidenceBySource(evidence: PublicEvidence[]) {
  const groups = new Map<string, { file: string; page: number | null; items: PublicEvidence[] }>();
  for (const item of evidence) {
    const page = typeof item.locator.page === 'number' ? item.locator.page : null;
    const file = item.artifact.logicalPath;
    const key = JSON.stringify([file, item.artifact.contentHash, page]);
    const group = groups.get(key) ?? { file, page, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.file.localeCompare(b.file) || (a.page ?? Infinity) - (b.page ?? Infinity)).map(group => ({
    ...group,
    items: group.items.sort((a, b) => String(a.locator.blockId ?? '').localeCompare(String(b.locator.blockId ?? ''), undefined, { numeric: true })),
  }));
}
