import { createHash } from 'node:crypto';

import {
  createDefaultIngestionAdapters,
  parseIngestionWithAdapters,
  type ParsedIngestion,
} from '../../src/ingestion-parser';
import { createParserSelfTestFixtures } from '../../src/parser-self-test';

export type ResearchCorpusFeature =
  | 'native_text'
  | 'scan'
  | 'docx'
  | 'markdown'
  | 'tex'
  | 'table'
  | 'formula';

export interface ResearchCorpusCase {
  id: string;
  filename: string;
  content: Buffer;
  language: 'en' | 'zh' | 'mixed';
  features: ResearchCorpusFeature[];
  rights: 'self-authored';
  expectedCurrentStatus: ParsedIngestion['status'];
  expectedText?: string;
}

const fixtures = createParserSelfTestFixtures();

export const RESEARCH_INTELLIGENCE_CORPUS: ResearchCorpusCase[] = [
  {
    id: 'corrupt-pdf-en',
    filename: 'corrupt.pdf',
    content: Buffer.from('%PDF-1.7\nOpenScience self-authored intentionally incomplete fixture\n', 'utf8'),
    language: 'en',
    features: ['native_text'],
    rights: 'self-authored',
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'markdown-mixed',
    filename: 'claim.md',
    content: Buffer.from('# Claim\n\nOpenScience evidence supports 可复核的科研叙事。\n', 'utf8'),
    language: 'mixed',
    features: ['native_text', 'markdown'],
    rights: 'self-authored',
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence supports',
  },
  {
    id: 'native-docx-en',
    filename: 'fixture.docx',
    content: fixtures.docx,
    language: 'en',
    features: ['native_text', 'docx'],
    rights: 'self-authored',
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence document',
  },
  {
    id: 'native-pdf-en',
    filename: 'fixture.pdf',
    content: fixtures.pdf,
    language: 'en',
    features: ['native_text'],
    rights: 'self-authored',
    expectedCurrentStatus: 'ready',
    expectedText: 'OpenScience evidence document',
  },
  {
    id: 'scan-png-empty',
    filename: 'scan.png',
    content: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
    language: 'en',
    features: ['scan'],
    rights: 'self-authored',
    expectedCurrentStatus: 'needs_review',
  },
  {
    id: 'tex-formula-en',
    filename: 'method.tex',
    content: Buffer.from('\\section{Method}\nThe fitted signal is $I(t)=I_0 e^{-t/\\tau}$.\n', 'utf8'),
    language: 'en',
    features: ['native_text', 'tex', 'formula'],
    rights: 'self-authored',
    expectedCurrentStatus: 'ready',
    expectedText: 'I_0 e^{-t/\\tau}',
  },
];

export function buildResearchIntelligenceManifest() {
  return {
    schemaVersion: 1,
    cases: [...RESEARCH_INTELLIGENCE_CORPUS]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((corpusCase) => ({
        id: corpusCase.id,
        filename: corpusCase.filename,
        language: corpusCase.language,
        features: corpusCase.features,
        rights: corpusCase.rights,
        expectedCurrentStatus: corpusCase.expectedCurrentStatus,
        sha256: createHash('sha256').update(corpusCase.content).digest('hex'),
      })),
  };
}

export function parseResearchCorpusCase(corpusCase: ResearchCorpusCase): Promise<ParsedIngestion> {
  return parseIngestionWithAdapters(
    corpusCase.filename,
    corpusCase.content,
    createDefaultIngestionAdapters(),
  );
}

export async function buildCurrentParserBaseline() {
  const cases = [];

  for (const corpusCase of RESEARCH_INTELLIGENCE_CORPUS) {
    const rssBefore = process.memoryUsage().rss;
    const startedAt = performance.now();
    const parsed = await parseResearchCorpusCase(corpusCase);
    const elapsedMs = performance.now() - startedAt;
    const rssDeltaBytes = process.memoryUsage().rss - rssBefore;

    cases.push({
      id: corpusCase.id,
      contentHash: createHash('sha256').update(corpusCase.content).digest('hex'),
      status: parsed.status,
      reason: parsed.status === 'needs_review' ? parsed.reason : undefined,
      textMatched: corpusCase.expectedText
        ? parsed.status === 'ready' && parsed.text.includes(corpusCase.expectedText)
        : undefined,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      rssDeltaBytes,
    });
  }

  return {
    schemaVersion: 1,
    runtime: 'current-agent-worker',
    cases,
  } as const;
}
