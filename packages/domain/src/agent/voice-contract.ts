/** Browser-safe voice contract. Private checkpoints are never generic task products. */
/** Reader release: opening fresh writes is a separate, reviewed source change. */
export function isHermesVoiceWriterEnabled(): boolean { return false; }
export const HERMES_VOICE_READER_ONLY = '[blocked] Voice reader stage does not accept new submissions';
// Preserve an existing persisted owner-stop marker without adding the generic cancel API.
export const HERMES_VOICE_OWNED_STOP_REASON = '[blocked] Execution stopped by its owner';
export function isHermesVoiceStopped(value: { error?: string | null } | string | null | undefined): boolean {
  return (typeof value === 'string' ? value : value?.error) === HERMES_VOICE_OWNED_STOP_REASON;
}
export const HERMES_VOICE_MAX_RECORDING_SECONDS = 60;
export const HERMES_VOICE_MAX_RECORDING_BYTES = 1_920_044;
export const HERMES_VOICE_REPLY_MAX_UTF8_BYTES = 1_000;
export const HERMES_VOICE_TRANSCRIPTION_CREDITS = 1;
export const HERMES_VOICE_RECEIPT_KEY = 'hermesVoice';
export const HERMES_VOICE_HOLD = '[blocked] Voice request may have been paid; only a saved supplier task may resume';
export const HERMES_VOICE_TASK_KINDS = ['voice.transcribe', 'voice.reply'] as const;
export type HermesVoiceTaskKind = typeof HERMES_VOICE_TASK_KINDS[number];
export type HermesVoiceLanguage = 'zh' | 'en';
export interface HermesVoicePreset {
  id: string; name: string; languages: readonly HermesVoiceLanguage[]; creditsPerRequest: 1;
}
export interface HermesVoiceCapabilities {
  available: boolean; maxRecordingSeconds: 60; transcriptionCredits: 1;
  replyMaxUtf8Bytes: 1000; voices: HermesVoicePreset[];
}
export type HermesVoicePayload = {
  operation: 'transcription'; objectKey: string; sha256: string; bytes: number; durationSeconds: number;
  language?: HermesVoiceLanguage;
} | {
  operation: 'reply'; sourceTaskId: string; sourceExecutionAttempt: number; spokenText: string; voiceId: string;
};
export interface HermesVoiceIdentity {
  taskId: string; sessionId: string; userId: string; researchObjectId: string | null;
  kind: HermesVoiceTaskKind; executionAttempt: number;
}
export interface HermesVoiceAudio {
  objectKey: string; sha256: string; bytes: number; contentType: 'audio/mpeg';
}
export interface HermesVoiceCheckpoint {
  identity: HermesVoiceIdentity; request: HermesVoicePayload;
  phase: 'submitting' | 'submitted' | 'completed' | 'failed';
  providerId?: string; credits?: number; transcript?: string; audio?: HermesVoiceAudio;
}
export type HermesVoiceResult = {
  operation: 'transcription'; transcript?: string; canResume?: boolean; uncertain?: boolean;
} | { operation: 'reply'; audioReady?: boolean; spokenText?: string; canResume?: boolean; uncertain?: boolean };

export function isHermesVoiceTaskKind(kind: string): kind is HermesVoiceTaskKind {
  return (HERMES_VOICE_TASK_KINDS as readonly string[]).includes(kind);
}
export function hasHermesVoiceCheckpoint(result: unknown): boolean {
  return !!result && typeof result === 'object' && !Array.isArray(result) && Object.hasOwn(result, HERMES_VOICE_RECEIPT_KEY);
}
/** Call only after the live owner/session/source authority check. This is an allowlist. */
export function projectHermesVoiceResult(kind: HermesVoiceTaskKind, status: string,
  checkpoint: HermesVoiceCheckpoint | undefined, stopped = false): HermesVoiceResult {
  const operation = kind === 'voice.transcribe' ? 'transcription' : 'reply';
  if (stopped) return { operation };
  const recovery = status === 'failed' && !!checkpoint?.providerId
    && (checkpoint.phase === 'submitted' || checkpoint.phase === 'completed');
  const common = { ...(recovery ? { canResume: true } : {}),
    ...(checkpoint?.phase === 'submitting' && !checkpoint.providerId ? { uncertain: true } : {}) };
  if (operation === 'transcription') return { operation, ...common,
    ...(status === 'succeeded' && checkpoint?.phase === 'completed' && typeof checkpoint.transcript === 'string'
      ? { transcript: checkpoint.transcript } : {}) };
  return { operation, ...common,
    ...(status === 'succeeded' && checkpoint?.phase === 'completed' && checkpoint.audio && checkpoint.request.operation === 'reply'
      ? { audioReady: true, spokenText: checkpoint.request.spokenText } : {}) };
}
