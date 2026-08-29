import { validateResearchIdentityProfile } from './validation';
import type { ResearchIdentityProfile, ResearchIdentityProfileState } from './types';

const MAX_SIGNALS = 100;
const MAX_SIGNAL_LENGTH = 160;

export type ResearchIdentityProfileErrorCode =
  | 'INVALID_PROFILE_STATE'
  | 'INVALID_PROFILE_PATCH'
  | 'PROFILE_VERSION_CONFLICT'
  | 'INVALID_INTEREST_SIGNAL';

export class ResearchIdentityProfileError extends Error {
  constructor(public readonly code: ResearchIdentityProfileErrorCode, message: string) {
    super(message);
    this.name = 'ResearchIdentityProfileError';
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new ResearchIdentityProfileError('INVALID_PROFILE_PATCH', `${label} has unknown field "${unknown}"`);
}

function validateSignals(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_SIGNALS) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', `${label} must contain at most ${MAX_SIGNALS} signals`);
  }
  if (value.some((signal) => typeof signal !== 'string'
    || signal.trim().length === 0 || signal.length > MAX_SIGNAL_LENGTH || signal !== signal.trim())) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', `${label} contains an invalid signal`);
  }
  if (new Set(value).size !== value.length) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', `${label} contains duplicate signals`);
  }
  return [...value];
}

export function validateResearchIdentityProfileState(value: unknown): ResearchIdentityProfileState {
  const state = objectValue(value, 'ResearchIdentityProfileState');
  onlyKeys(state, [
    'identities', 'primaryIdentity', 'disciplines', 'methods', 'topics', 'languages',
    'profileVersion', 'acceptedSignals', 'rejectedSignals',
  ], 'ResearchIdentityProfileState');
  const profile = validateResearchIdentityProfile({
    identities: state.identities,
    primaryIdentity: state.primaryIdentity,
    disciplines: state.disciplines,
    methods: state.methods,
    topics: state.topics,
    languages: state.languages,
  });
  if (!Number.isSafeInteger(state.profileVersion) || (state.profileVersion as number) < 1) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', 'profileVersion must be a positive integer');
  }
  const acceptedSignals = validateSignals(state.acceptedSignals, 'acceptedSignals');
  const rejectedSignals = validateSignals(state.rejectedSignals, 'rejectedSignals');
  if (acceptedSignals.some((signal) => rejectedSignals.includes(signal))) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_STATE', 'acceptedSignals and rejectedSignals must not overlap');
  }
  return {
    ...profile,
    profileVersion: state.profileVersion as number,
    acceptedSignals,
    rejectedSignals,
  };
}

export type ResearchIdentityProfilePatch = Partial<ResearchIdentityProfile> & {
  expectedProfileVersion: number;
};

export function applyResearchIdentityProfilePatch(
  currentValue: unknown,
  patchValue: unknown,
): ResearchIdentityProfileState {
  const current = validateResearchIdentityProfileState(currentValue);
  const patch = objectValue(patchValue, 'ResearchIdentityProfilePatch');
  onlyKeys(patch, [
    'expectedProfileVersion', 'identities', 'primaryIdentity', 'disciplines', 'methods', 'topics', 'languages',
  ], 'ResearchIdentityProfilePatch');
  if (!Number.isSafeInteger(patch.expectedProfileVersion)) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_PATCH', 'expectedProfileVersion must be an integer');
  }
  if (patch.expectedProfileVersion !== current.profileVersion) {
    throw new ResearchIdentityProfileError('PROFILE_VERSION_CONFLICT', 'research identity profile version conflict');
  }
  const changedKeys = Object.keys(patch).filter((key) => key !== 'expectedProfileVersion');
  if (changedKeys.length === 0) {
    throw new ResearchIdentityProfileError('INVALID_PROFILE_PATCH', 'profile patch must change at least one field');
  }
  const profile = validateResearchIdentityProfile({
    identities: patch.identities ?? current.identities,
    primaryIdentity: patch.primaryIdentity ?? current.primaryIdentity,
    disciplines: patch.disciplines ?? current.disciplines,
    methods: patch.methods ?? current.methods,
    topics: patch.topics ?? current.topics,
    languages: patch.languages ?? current.languages,
  });
  return { ...current, ...profile, profileVersion: current.profileVersion + 1 };
}

export interface ResearchInterestSignalCorrection {
  expectedProfileVersion: number;
  signal: string;
  decision: 'accept' | 'reject';
}

export function correctResearchInterestSignal(
  currentValue: unknown,
  correctionValue: unknown,
): ResearchIdentityProfileState {
  const current = validateResearchIdentityProfileState(currentValue);
  const correction = objectValue(correctionValue, 'ResearchInterestSignalCorrection');
  onlyKeys(correction, ['expectedProfileVersion', 'signal', 'decision'], 'ResearchInterestSignalCorrection');
  if (!Number.isSafeInteger(correction.expectedProfileVersion)
    || correction.expectedProfileVersion !== current.profileVersion) {
    throw new ResearchIdentityProfileError('PROFILE_VERSION_CONFLICT', 'research identity profile version conflict');
  }
  if (typeof correction.signal !== 'string' || correction.signal.trim().length === 0
    || correction.signal.length > MAX_SIGNAL_LENGTH) {
    throw new ResearchIdentityProfileError('INVALID_INTEREST_SIGNAL', 'signal is invalid');
  }
  if (correction.decision !== 'accept' && correction.decision !== 'reject') {
    throw new ResearchIdentityProfileError('INVALID_INTEREST_SIGNAL', 'signal decision is invalid');
  }
  const signal = correction.signal.trim();
  const accepted = new Set(current.acceptedSignals);
  const rejected = new Set(current.rejectedSignals);
  if (correction.decision === 'accept') {
    rejected.delete(signal);
    accepted.add(signal);
  } else {
    accepted.delete(signal);
    rejected.add(signal);
  }
  if (accepted.size > MAX_SIGNALS || rejected.size > MAX_SIGNALS) {
    throw new ResearchIdentityProfileError('INVALID_INTEREST_SIGNAL', `signal lists contain at most ${MAX_SIGNALS} values`);
  }
  return {
    ...current,
    acceptedSignals: [...accepted].sort(),
    rejectedSignals: [...rejected].sort(),
    profileVersion: current.profileVersion + 1,
  };
}
