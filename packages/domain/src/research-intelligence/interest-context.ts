import { isDeepStrictEqual } from 'node:util';
import { validateResearchIdentityProfileState } from './identity-profile-service';
import type {
  InterestContext,
  InterestRoutingReason,
  ResearchIdentityProfileState,
} from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BuildInterestContextInput {
  profile?: ResearchIdentityProfileState;
  currentGoal?: string;
  activeResearchObjectId?: string;
  activeClaimId?: string;
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('InterestContext input must be an object');
  }
  const input = value as Record<string, unknown>;
  const allowed = ['profile', 'currentGoal', 'activeResearchObjectId', 'activeClaimId'];
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`InterestContext input has unknown field "${unknown}"`);
  return input;
}

function optionalUuid(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error(`${label} is invalid`);
  return value.toLowerCase();
}

function reason(code: InterestRoutingReason['code'], values: string[]): InterestRoutingReason | undefined {
  return values.length > 0 ? { code, values: [...values] } : undefined;
}

export function buildInterestContext(value: unknown): InterestContext {
  const input = inputObject(value);
  const profileMissing = input.profile === undefined;
  const profile = profileMissing ? {
    identities: ['reader'] as const,
    primaryIdentity: 'reader' as const,
    disciplines: [],
    methods: [],
    topics: [],
    languages: [],
    profileVersion: 0,
    acceptedSignals: [],
    rejectedSignals: [],
  } : validateResearchIdentityProfileState(input.profile);
  let currentGoal: string | undefined;
  if (input.currentGoal !== undefined) {
    if (typeof input.currentGoal !== 'string' || input.currentGoal.trim().length === 0
      || input.currentGoal.length > 2_000) throw new Error('currentGoal is invalid');
    currentGoal = input.currentGoal.trim();
  }
  const activeResearchObjectId = optionalUuid(input.activeResearchObjectId, 'activeResearchObjectId');
  const activeClaimId = optionalUuid(input.activeClaimId, 'activeClaimId');
  const routingReasons = [
    reason('explicit_goal', currentGoal ? [currentGoal] : []),
    reason('active_claim', activeClaimId ? [activeClaimId] : []),
    reason('active_research_object', activeResearchObjectId ? [activeResearchObjectId] : []),
    reason('primary_identity', [profile.primaryIdentity]),
    reason('persistent_disciplines', profile.disciplines),
    reason('persistent_methods', profile.methods),
    reason('persistent_topics', profile.topics),
    reason('persistent_languages', profile.languages),
    reason('accepted_history', profile.acceptedSignals),
    reason('rejected_history', profile.rejectedSignals),
  ].filter((entry): entry is InterestRoutingReason => entry !== undefined);
  return {
    schemaVersion: 1,
    profileVersion: profile.profileVersion,
    primaryIdentity: profile.primaryIdentity,
    identities: [...profile.identities],
    disciplines: [...profile.disciplines],
    methods: [...profile.methods],
    topics: [...profile.topics],
    languages: [...profile.languages],
    ...(currentGoal ? { currentGoal } : {}),
    ...(activeResearchObjectId ? { activeResearchObjectId } : {}),
    ...(activeClaimId ? { activeClaimId } : {}),
    acceptedSignals: [...profile.acceptedSignals],
    rejectedSignals: [...profile.rejectedSignals],
    routingReasons,
    ...(profileMissing ? { profileMissing: true as const } : {}),
  };
}

export function validateInterestContext(value: unknown): InterestContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('InterestContext must be an object');
  const context = value as Record<string, unknown>;
  const allowed = [
    'schemaVersion', 'profileVersion', 'primaryIdentity', 'identities', 'disciplines', 'methods', 'topics',
    'languages', 'currentGoal', 'activeResearchObjectId', 'activeClaimId', 'acceptedSignals', 'rejectedSignals',
    'routingReasons', 'profileMissing',
  ];
  const unknown = Object.keys(context).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`InterestContext has unknown field "${unknown}"`);
  const profileMissing = context.profileMissing === true;
  const rebuilt = buildInterestContext({
    ...(!profileMissing ? {
      profile: {
        identities: context.identities,
        primaryIdentity: context.primaryIdentity,
        disciplines: context.disciplines,
        methods: context.methods,
        topics: context.topics,
        languages: context.languages,
        profileVersion: context.profileVersion,
        acceptedSignals: context.acceptedSignals,
        rejectedSignals: context.rejectedSignals,
      },
    } : {}),
    ...(context.currentGoal !== undefined ? { currentGoal: context.currentGoal } : {}),
    ...(context.activeResearchObjectId !== undefined ? { activeResearchObjectId: context.activeResearchObjectId } : {}),
    ...(context.activeClaimId !== undefined ? { activeClaimId: context.activeClaimId } : {}),
  });
  if (!isDeepStrictEqual(context, rebuilt)) throw new Error('InterestContext does not match deterministic routing');
  return rebuilt;
}
