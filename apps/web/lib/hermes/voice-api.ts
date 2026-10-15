import { apiRequest, type AgentTaskView } from '@/lib/api';

export interface HermesVoiceCapabilities {
  available: boolean;
  maxRecordingSeconds: number;
  transcriptionCredits: number;
  replyMaxUtf8Bytes: number;
  voices: Array<{ id: string; name: string; languages: string[]; creditsPerRequest: number }>;
}

const base = '/api/agent/voice';
export function getVoiceCapabilities(signal?: AbortSignal): Promise<HermesVoiceCapabilities> {
  return apiRequest(`${base}/capabilities`, { cache: 'no-store', signal });
}
export function transcribeVoice(sessionId: string, file: Blob, idempotencyKey: string, signal?: AbortSignal): Promise<{ task: AgentTaskView }> {
  const body = new FormData(); body.set('sessionId', sessionId); body.set('file', file, 'hermes-recording.wav');
  // Omit language so a mixed Chinese/English research utterance can be recognized.
  return apiRequest(`${base}/transcriptions`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body, signal });
}
export function createVoiceReply(sourceTaskId: string, voiceId: string, idempotencyKey: string, signal?: AbortSignal): Promise<{ task: AgentTaskView }> {
  return apiRequest(`${base}/replies`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ sourceTaskId, voiceId }), signal });
}
export function getVoiceTask(taskId: string, signal?: AbortSignal): Promise<{ task: AgentTaskView }> {
  return apiRequest(`${base}/tasks/${encodeURIComponent(taskId)}`, { cache: 'no-store', signal });
}
export function findVoiceSubmission(idempotencyKey: string, signal?: AbortSignal): Promise<{ task: AgentTaskView }> {
  return apiRequest(`${base}/submissions/${encodeURIComponent(idempotencyKey)}`, { cache: 'no-store', signal });
}
export function resumeVoiceTask(taskId: string, signal?: AbortSignal): Promise<{ task: AgentTaskView }> {
  return apiRequest(`${base}/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST', signal });
}

export function readVoiceTranscript(task: AgentTaskView): string | null {
  const value = task.result;
  return task.kind === 'voice.transcribe' && task.status === 'succeeded' && value?.operation === 'transcription'
    && value.uncertain !== true && typeof value.transcript === 'string' && value.transcript.trim().length > 0
    && value.transcript.length <= 2000 ? value.transcript : null;
}
export function isVoiceReplyReady(task: AgentTaskView): boolean {
  return task.kind === 'voice.reply' && task.status === 'succeeded' && task.result?.operation === 'reply'
    && task.result.uncertain !== true && task.result.audioReady === true;
}
export function voiceTaskAudioUrl(taskId: string): string { return `/api/agent/voice/tasks/${encodeURIComponent(taskId)}/audio`; }

export function mergeVoiceTranscript(input: { scope: string; currentScope: string; currentDraft: string; transcript: string }): string | null {
  if (input.scope !== input.currentScope || !input.transcript.trim()) return null;
  const merged = input.currentDraft ? `${input.currentDraft}\n${input.transcript.trim()}` : input.transcript.trim();
  return merged.length <= 2000 ? merged : null;
}

export function selectReplyVoice(capabilities: HermesVoiceCapabilities, locale: 'zh' | 'en') {
  return capabilities.voices.find(voice => voice.creditsPerRequest === 1
    && voice.languages.some(language => language.toLowerCase().split('-')[0] === locale));
}

export function canReadReply(task: AgentTaskView | null, maxUtf8Bytes: number): boolean {
  return task?.kind === 'workspace.guide' && task.status === 'succeeded' && typeof task.result?.summary === 'string'
    && task.result.summary.trim().length > 0 && new TextEncoder().encode(task.result.summary).length <= maxUtf8Bytes;
}
