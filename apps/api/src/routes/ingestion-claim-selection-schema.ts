import { z } from 'zod';
import { CLAIM_KINDS, CLAIM_RELATIONS, INGESTION_BRIDGE_FIELDS, MAX_CANONICAL_EVIDENCE_SEGMENTS } from '@openscience/domain';

/** Both direct confirmation and Hermes confirmation use the same source selection shape. */
export const ingestionClaimSelectionSchema = z.object({
  clientKey: z.string().min(1).max(100),
  sourceField: z.enum(INGESTION_BRIDGE_FIELDS),
  kind: z.enum(CLAIM_KINDS),
  parentClientKey: z.string().min(1).max(100).optional(),
  statement: z.string().min(1).max(4_000),
  conditions: z.array(z.string().min(1).max(500)).max(100).optional(),
  limitations: z.array(z.string().min(1).max(500)).max(100).optional(),
  attachSourceQuote: z.boolean(),
  sourceBindings: z.array(z.object({
    sourceIndex: z.number().int().min(0).max(MAX_CANONICAL_EVIDENCE_SEGMENTS - 1),
    relation: z.enum(CLAIM_RELATIONS),
  }).strict()).min(1).max(MAX_CANONICAL_EVIDENCE_SEGMENTS).optional(),
}).strict();
