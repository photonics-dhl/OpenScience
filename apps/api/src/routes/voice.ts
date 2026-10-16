import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import type { AuthDeps } from '@openscience/auth';
import type { MalwareScanner, StorageAdapter } from '@openscience/storage';
import { HERMES_VOICE_MAX_WAV_BYTES, validateHermesVoiceWav, type SynclipVoiceRuntime } from '@openscience/ai-gateway';
import { AgentError, findHermesVoiceSubmission, getHermesVoiceAudio, getHermesVoiceTask,
  resumeHermesVoiceTask, submitHermesVoiceReply, submitHermesVoiceTranscription,
  isHermesVoiceWriterEnabled, HERMES_VOICE_READER_ONLY,
  type HermesVoiceDeps, type HermesVoicePreset } from '@openscience/domain';
import { requireCurrentUser } from './session-guard';
import { sendHermesVoiceAudioContent } from './presentation-asset-content';

export type VoiceRouteDeps = AuthDeps & { storage?: StorageAdapter; voiceRuntime?: SynclipVoiceRuntime; malwareScanner?: MalwareScanner };
const idSchema = z.string().uuid();
const replySchema = z.object({ sourceTaskId: idSchema, voiceId: z.string().min(1).max(200) }).strict();
const audit = (req: FastifyRequest) => ({ requestId: String(req.id), ip: req.ip });
const key = (req: FastifyRequest) => idSchema.parse(req.headers['idempotency-key']);

export function registerHermesVoiceRoutes(app: FastifyInstance, deps: VoiceRouteDeps): void {
  void app.register(multipart, { limits: { fileSize: HERMES_VOICE_MAX_WAV_BYTES, files: 1, fields: 2, parts: 3 } });
  const domain = (voicePresets: readonly HermesVoicePreset[] = []): HermesVoiceDeps => {
    if (!deps.storage) throw new AgentError('ILLEGAL_TRANSITION', '语音存储暂不可用，请继续使用文字对话。');
    return { ...deps, storage: deps.storage, voicePresets };
  };
  const runtime = () => {
    if (!isHermesVoiceWriterEnabled()) throw new AgentError('ILLEGAL_TRANSITION', HERMES_VOICE_READER_ONLY);
    if (!deps.voiceRuntime || !deps.storage) throw new AgentError('ILLEGAL_TRANSITION', '语音服务尚未配置，请继续使用文字对话。');
    return deps.voiceRuntime;
  };
  app.get('/agent/voice/capabilities', async (req, reply) => {
    if (!await requireCurrentUser(deps, req, reply)) return;
    const available = isHermesVoiceWriterEnabled() && Boolean(deps.voiceRuntime && deps.storage);
    return reply.header('Cache-Control', 'private, no-store').send({ available, maxRecordingSeconds: 60,
      transcriptionCredits: 1, replyMaxUtf8Bytes: 1000,
      voices: available ? await deps.voiceRuntime!.listPresets() : [] });
  });
  app.post('/agent/voice/transcriptions', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const idempotencyKey = key(req); runtime();
    const fields: Record<string, string> = {};
    let recording: Buffer | undefined;
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || recording) throw new AgentError('VALIDATION_ERROR', '只接受一段录音。');
        const chunks: Buffer[] = []; let size = 0;
        for await (const value of part.file) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          size += chunk.length;
          if (size > HERMES_VOICE_MAX_WAV_BYTES) throw new AgentError('VALIDATION_ERROR', '录音最多60秒，请缩短后重录。');
          chunks.push(chunk);
        }
        if (part.file.truncated) throw new AgentError('VALIDATION_ERROR', '录音最多60秒，请缩短后重录。');
        recording = Buffer.concat(chunks);
      } else {
        if (!['sessionId', 'language'].includes(part.fieldname) || Object.hasOwn(fields, part.fieldname)
          || typeof part.value !== 'string') throw new AgentError('VALIDATION_ERROR', '录音字段无效。');
        fields[part.fieldname] = part.value;
      }
    }
    const sessionId = idSchema.parse(fields.sessionId);
    const language = z.enum(['zh', 'en']).optional().parse(fields.language);
    if (!recording) throw new AgentError('VALIDATION_ERROR', '请先录音，再提交识别。');
    try { validateHermesVoiceWav(recording); }
    catch { throw new AgentError('VALIDATION_ERROR', '录音格式无效，请重新录制不超过60秒的语音。'); }
    await deps.malwareScanner?.(recording);
    const task = await submitHermesVoiceTranscription(domain(), { userId: user.userId, sessionId, idempotencyKey,
      recording, ...(language ? { language } : {}) }, audit(req));
    return reply.status(202).header('Cache-Control', 'private, no-store').send({ task });
  });
  app.post('/agent/voice/replies', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const body = replySchema.parse(req.body); const idempotencyKey = key(req);
    const presets = await runtime().listPresets();
    const task = await submitHermesVoiceReply(domain(presets), { userId: user.userId, ...body, idempotencyKey }, audit(req));
    return reply.status(202).header('Cache-Control', 'private, no-store').send({ task });
  });
  app.get('/agent/voice/submissions/:key', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { key: idempotencyKey } = z.object({ key: idSchema }).parse(req.params);
    const task = await findHermesVoiceSubmission(domain(), { userId: user.userId, idempotencyKey });
    return reply.header('Cache-Control', 'private, no-store').send({ task });
  });
  app.get('/agent/voice/tasks/:id', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { id: taskId } = z.object({ id: idSchema }).parse(req.params);
    const task = await getHermesVoiceTask(domain(), { userId: user.userId, taskId });
    return reply.header('Cache-Control', 'private, no-store').send({ task });
  });
  app.post('/agent/voice/tasks/:id/resume', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { id: taskId } = z.object({ id: idSchema }).parse(req.params);
    const task = await resumeHermesVoiceTask(domain(), { userId: user.userId, taskId }, audit(req));
    return reply.header('Cache-Control', 'private, no-store').send({ task });
  });
  app.get('/agent/voice/tasks/:id/audio', async (req, reply) => {
    const user = await requireCurrentUser(deps, req, reply); if (!user) return;
    const { id: taskId } = z.object({ id: idSchema }).parse(req.params);
    const audio = await getHermesVoiceAudio(domain(), { userId: user.userId, taskId });
    return sendHermesVoiceAudioContent(deps.storage!, taskId, audio, reply, req.headers);
  });
}
