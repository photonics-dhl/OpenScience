export const RESEARCH_IDENTITIES = [
  'reader',
  'author',
  'reviewer',
  'editor',
  'data_steward',
  'developer',
  'student',
] as const;
export type ResearchIdentity = (typeof RESEARCH_IDENTITIES)[number];

export interface ResearchIdentityProfile {
  identities: ResearchIdentity[];
  primaryIdentity: ResearchIdentity;
  disciplines: string[];
  methods: string[];
  topics: string[];
  languages: string[];
}

export interface InterestContext {
  profileVersion: number;
  primaryIdentity: ResearchIdentity;
  currentGoal?: string;
  activeResearchObjectId?: string;
  activeClaimId?: string;
  acceptedSignals: string[];
  rejectedSignals: string[];
}

export const CLAIM_KINDS = ['core', 'supporting', 'method', 'boundary', 'counter'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const CLAIM_ASSESSMENTS = ['supported', 'partial', 'disputed', 'missing'] as const;
export type ClaimAssessment = (typeof CLAIM_ASSESSMENTS)[number];

export const EVIDENCE_KINDS = [
  'passage',
  'figure',
  'table',
  'dataset',
  'code',
  'notebook',
  'environment',
  'protocol',
  'supplement',
  'external_source',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const CLAIM_RELATIONS = ['supports', 'contradicts', 'qualifies', 'context'] as const;
export type ClaimRelation = (typeof CLAIM_RELATIONS)[number];

export const EXTRACTION_STATUSES = ['succeeded', 'needs_review', 'blocked', 'failed'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export interface ExtractionProvenance {
  source: 'deterministic' | 'ocr' | 'llm_ocr' | 'human';
  provider: string;
  providerVersion: string;
  inputHash: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceLocator {
  artifactId: string;
  contentHash: string;
  blockId?: string;
  page?: number;
  boundingBox?: BoundingBox;
  charRange?: { start: number; end: number };
  tableCell?: { sheet?: string; row: number; column: number };
  codeRange?: { commit: string; path: string; startLine: number; endLine: number };
}

export interface ClaimNode {
  id: string;
  researchObjectId: string;
  versionId: string;
  parentClaimId?: string;
  kind: ClaimKind;
  statement: string;
  assessment: ClaimAssessment;
  conditions: string[];
  limitations: string[];
  evidenceIds: string[];
  counterEvidenceIds: string[];
  provenance: ExtractionProvenance;
}

export interface EvidenceRecord {
  id: string;
  researchObjectId: string;
  versionId: string;
  claimId: string;
  kind: EvidenceKind;
  title: string;
  exactQuote?: string;
  locator: SourceLocator;
  relation: ClaimRelation;
  extractionConfidence?: number;
  verifiedByUserId?: string;
  provenance: ExtractionProvenance;
}

export const PRESENTATION_ASSET_KINDS = ['svg', 'chart', 'interactive_html', 'image', 'video'] as const;
export type PresentationAssetKind = (typeof PRESENTATION_ASSET_KINDS)[number];

export const PRESENTATION_ASSET_STATUSES = ['draft', 'approved', 'rejected'] as const;
export type PresentationAssetStatus = (typeof PRESENTATION_ASSET_STATUSES)[number];

export const PRESENTATION_ASSET_LABEL = 'presentation_not_evidence' as const;

export interface PresentationAsset {
  id: string;
  researchObjectId: string;
  versionId: string;
  kind: PresentationAssetKind;
  sourceClaimIds: string[];
  objectKey: string;
  contentHash: string;
  generator: string;
  generatorVersion: string;
  promptHash?: string;
  status: PresentationAssetStatus;
  label: typeof PRESENTATION_ASSET_LABEL;
  provenance: ExtractionProvenance;
}
