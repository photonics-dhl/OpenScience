import { downloadHermesVoiceAudio, validateHermesVoiceWav, type SynclipVoiceRuntime } from '@openscience/ai-gateway';
import { finalizeHermesVoiceTask, loadHermesVoiceExecution, saveHermesVoiceCheckpoint,
  withHermesVoiceSubmission, isHermesVoiceWriterEnabled, HERMES_VOICE_READER_ONLY,
  type HermesVoiceDeps, type HermesVoiceExecution } from '@openscience/domain';
import { rememberDiscardedTaskResult } from '@openscience/domain';
import { sha256HexBuffer } from '@openscience/storage';
import type { TaskHandler } from './index';

async function recording(deps: HermesVoiceDeps, execution: HermesVoiceExecution): Promise<Buffer> {
  if (execution.payload.operation !== 'transcription') throw new Error('[blocked] VOICE_REQUEST_INVALID');
  const input = execution.payload;
  const object = await deps.storage.getObject(input.objectKey);
  if (object.size !== input.bytes || object.size > 1_920_044) { object.body.destroy(); throw new Error('[blocked] VOICE_RECORDING_CHANGED'); }
  const chunks: Buffer[] = []; let size = 0;
  try {
    for await (const value of object.body) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value); size += chunk.length;
      if (size > input.bytes) throw new Error('[blocked] VOICE_RECORDING_CHANGED');
      chunks.push(chunk);
    }
  } finally { object.body.destroy(); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== input.bytes || sha256HexBuffer(bytes) !== input.sha256
    || validateHermesVoiceWav(bytes) !== input.durationSeconds) throw new Error('[blocked] VOICE_RECORDING_CHANGED');
  return bytes;
}

/** Each handler owns one bounded polling window; a saved ID is the only recovery path. */
export function createHermesVoiceHandlers(runtime?: SynclipVoiceRuntime, options: {
  maxPolls?: number; pollIntervalMs?: number; wait?: (milliseconds: number) => Promise<void>;
  downloadAudio?: typeof downloadHermesVoiceAudio;
} = {}): Record<'voice.transcribe' | 'voice.reply', TaskHandler> {
  const wait = options.wait ?? (async milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const handle: TaskHandler = async (workerDeps, task) => {
    if (!workerDeps.storage) throw new Error('[blocked] VOICE_STORAGE_UNAVAILABLE');
    const deps: HermesVoiceDeps = { ...workerDeps, storage: workerDeps.storage, voicePresets: [] };
    const execution = await loadHermesVoiceExecution(deps, { taskId: task.id, executionAttempt: task.executionAttempt });
    let checkpoint = execution.checkpoint;
    if (checkpoint?.phase === 'completed') return (await finalizeHermesVoiceTask(deps, execution)).result ?? {};
    if (checkpoint?.phase === 'submitting') throw new Error('[blocked] VOICE_SUBMISSION_UNCERTAIN');
    if (checkpoint?.phase === 'failed') throw new Error('[blocked] VOICE_PROVIDER_FAILED');
    if (!checkpoint && !isHermesVoiceWriterEnabled()) throw new Error(HERMES_VOICE_READER_ONLY);
    if (!runtime) throw new Error('[blocked] VOICE_UNAVAILABLE');
    if (!checkpoint) {
      const input = execution.payload;
      const bytes = input.operation === 'transcription' ? await recording(deps, execution) : undefined;
      if (input.operation === 'reply') {
        deps.voicePresets = await runtime.listPresets();
        if (!deps.voicePresets.some(preset => preset.id === input.voiceId)) throw new Error('[blocked] VOICE_PRESET_UNAVAILABLE');
      }
      checkpoint = await withHermesVoiceSubmission(deps, execution, async () => {
        if (input.operation === 'transcription') {
          const result = await runtime.client.createTranscription({ audio: bytes!, ...(input.language ? { language: input.language } : {}) });
          return { providerId: result.task_id, credits: result.credits_charged };
        }
        const result = await runtime.client.create({ text: input.spokenText, voice: input.voiceId, speed: 1 });
        return { providerId: result.task_id };
      });
    }
    if (!checkpoint.providerId) throw new Error('[blocked] VOICE_SUBMISSION_UNCERTAIN');
    const originalIdentity = checkpoint.identity;
    for (let index = 0; index < (options.maxPolls ?? 80); index++) {
      const output = execution.payload.operation === 'transcription'
        ? await runtime.client.queryTranscription(checkpoint.providerId)
        : await runtime.client.query(checkpoint.providerId);
      if (output.status === 'failed') {
        await saveHermesVoiceCheckpoint(deps, originalIdentity, { phase: 'failed',
          ...(output.coins_used === undefined ? {} : { credits: output.coins_used }) });
        throw new Error('[blocked] VOICE_PROVIDER_FAILED');
      }
      if (output.status === 'completed') {
        if (output.output.type === 'text') {
          await saveHermesVoiceCheckpoint(deps, originalIdentity, { phase: 'completed', transcript: output.output.text,
            ...(output.coins_used === undefined ? {} : { credits: output.coins_used }) });
        } else {
          if (!('url_expires_at' in output)) throw new Error('[blocked] VOICE_RESPONSE_INVALID');
          const audio = await (options.downloadAudio ?? downloadHermesVoiceAudio)(output);
          if (audio.bytes.length > 20 * 1024 * 1024) throw new Error('[blocked] VOICE_AUDIO_TOO_LARGE');
          const sha256 = sha256HexBuffer(audio.bytes);
          const objectKey = `derived/hermes-voice/${originalIdentity.userId}/${originalIdentity.taskId}/${sha256}.${audio.format}`;
          await deps.storage.putObject(objectKey, audio.bytes, { contentType: audio.contentType, sha256 });
          const storedAudio = { objectKey, sha256, bytes: audio.bytes.length, contentType: audio.contentType };
          try {
            await saveHermesVoiceCheckpoint(deps, originalIdentity, { phase: 'completed',
              ...(output.coins_used === undefined ? {} : { credits: output.coins_used }), audio: storedAudio });
          } catch (error) {
            // Physical purge may win while bytes are downloading. Existing trash
            // scope remembers the now-unreachable object without deleting paid output.
            await rememberDiscardedTaskResult(deps.prisma, originalIdentity.taskId, { hermesVoice: { audio: storedAudio } });
            throw error;
          }
        }
        return (await finalizeHermesVoiceTask(deps, execution)).result ?? {};
      }
      if (index + 1 < (options.maxPolls ?? 80)) await wait(options.pollIntervalMs ?? 1_500);
    }
    throw new Error('[retryable] VOICE_QUERY_INTERRUPTED');
  };
  return { 'voice.transcribe': handle, 'voice.reply': handle };
}
