'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mic, Square, Volume2 } from 'lucide-react';
import { ApiClientError, type AgentTaskView } from '@/lib/api';
import {
  canReadReply, createVoiceReply, findVoiceSubmission, getVoiceCapabilities, getVoiceTask,
  isVoiceReplyReady, mergeVoiceTranscript, readVoiceTranscript, resumeVoiceTask, selectReplyVoice,
  transcribeVoice, voiceTaskAudioUrl, type HermesVoiceCapabilities,
} from '@/lib/hermes/voice-api';
import { HermesVoiceRecorder, supportsVoiceRecording } from '@/lib/hermes/voice-recorder';
import styles from './HermesVoiceControls.module.css';

type Operation = 'transcription' | 'reply';
interface VoiceSubmission {
  key: string;
  state: 'submitting' | 'known' | 'unknown' | 'rejected';
  task?: AgentTaskView;
  sourceTaskId?: string;
  applied?: boolean;
  readFailed?: boolean;
}
/** Retain request identity across closing/reopening the drawer, never recorded media. */
export interface HermesVoiceMemory { scope: string; transcription?: VoiceSubmission; reply?: VoiceSubmission }

function unresolved(job?: VoiceSubmission) {
  return Boolean(job && (job.state === 'submitting' || job.state === 'unknown'
    || job.task?.status === 'pending' || job.task?.status === 'running' || job.task?.result?.uncertain === true));
}

export function HermesVoiceControls({ scope, locale, draft, disabled, sourceTask, ensureSession, onApply, memory }: {
  scope: string;
  locale: 'zh' | 'en';
  draft: string;
  disabled: boolean;
  sourceTask: AgentTaskView | null;
  ensureSession(): Promise<string>;
  onApply(transcript: string, scope: string): boolean;
  memory: React.MutableRefObject<HermesVoiceMemory>;
}) {
  const t = useTranslations('hermesVoice');
  if (memory.current.scope !== scope) memory.current = { scope };
  const [jobs, setJobs] = useState(() => {
    const { transcription, reply } = memory.current;
    return { transcription: transcription?.state === 'submitting' ? { ...transcription, state: 'unknown' as const } : transcription,
      reply: reply?.state === 'submitting' ? { ...reply, state: 'unknown' as const } : reply };
  });
  const [capabilities, setCapabilities] = useState<HermesVoiceCapabilities | null>(null);
  const [supported, setSupported] = useState(false);
  const [visible, setVisible] = useState(true);
  const [recording, setRecording] = useState<'idle' | 'requesting' | 'recording' | 'encoding' | 'ready'>('idle');
  const [preparingSession, setPreparingSession] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pendingTranscript, setPendingTranscript] = useState(() => jobs.transcription?.task && !jobs.transcription.applied ? readVoiceTranscript(jobs.transcription.task) ?? '' : '');
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState<Operation | null>(null);
  const [playing, setPlaying] = useState(false);
  const mounted = useRef(false);
  const recorder = useRef<HermesVoiceRecorder | null>(null);
  const recorded = useRef<Blob | null>(null);
  const controllers = useRef(new Set<AbortController>());
  const seenTranscript = useRef(pendingTranscript ? jobs.transcription?.task?.id ?? '' : '');
  const audio = useRef<HTMLAudioElement>(null);
  const recordStarted = useRef(0);
  const requestBusy = useRef(false);
  const sessionPreparation = useRef<symbol | null>(null);

  const current = () => memory.current.scope === scope;
  const saveJob = (operation: Operation, value: VoiceSubmission | undefined) => {
    if (!current()) return;
    memory.current[operation] = value;
    if (mounted.current) setJobs(previous => ({ ...previous, [operation]: value }));
  };
  const stopAudio = () => {
    const player = audio.current;
    if (player) { player.pause(); player.currentTime = 0; }
    if (mounted.current) setPlaying(false);
  };
  const cancelLocal = () => {
    sessionPreparation.current = null;
    recorder.current?.cancel(); recorder.current = null; recorded.current = null;
    if (mounted.current) { setPreparingSession(false); setRecording('idle'); setSeconds(0); }
    stopAudio();
  };
  async function bounded<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); controllers.current.add(controller);
    const timer = setTimeout(() => controller.abort(), 45_000);
    try { return await request(controller.signal); }
    finally { clearTimeout(timer); controllers.current.delete(controller); }
  }

  useEffect(() => {
    mounted.current = true;
    setSupported(supportsVoiceRecording());
    const controller = new AbortController();
    void getVoiceCapabilities(controller.signal).then(value => { if (mounted.current) setCapabilities(value); }).catch(() => { if (mounted.current) setCapabilities(null); });
    const visibility = () => { setVisible(!document.hidden); if (document.hidden) cancelLocal(); };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false; controller.abort();
      document.removeEventListener('visibilitychange', visibility);
      cancelLocal(); controllers.current.forEach(value => value.abort()); controllers.current.clear();
    };
    // The parent keys this component by owner and research object.
  }, [scope]);

  useEffect(() => {
    stopAudio();
    const job = memory.current.reply;
    if (job?.sourceTaskId && job.sourceTaskId !== sourceTask?.id && !unresolved(job)) saveJob('reply', undefined);
  }, [sourceTask?.id]);

  useEffect(() => {
    if (recording !== 'recording') return;
    const timer = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - recordStarted.current) / 1000))), 250);
    return () => clearInterval(timer);
  }, [recording]);

  const receive = (operation: Operation, key: string, task: AgentTaskView) => {
    const previous = memory.current[operation];
    if (!current() || previous?.key !== key) return;
    const expectedKind = operation === 'transcription' ? 'voice.transcribe' : 'voice.reply';
    if (task.kind !== expectedKind) { saveJob(operation, { ...previous, state: 'unknown' }); return; }
    saveJob(operation, { ...previous, task, state: 'known', readFailed: false });
    if (operation === 'transcription' && seenTranscript.current !== task.id) {
      const transcript = readVoiceTranscript(task);
      if (transcript !== null && !previous.applied) {
        seenTranscript.current = task.id;
        if (mounted.current) setPendingTranscript(transcript);
      }
    }
  };

  async function recover(operation: Operation, job: VoiceSubmission) {
    if (requestBusy.current) return;
    requestBusy.current = true; setReading(operation);
    try {
      const response = await bounded(signal => job.task ? getVoiceTask(job.task.id, signal) : findVoiceSubmission(job.key, signal));
      receive(operation, job.key, response.task);
    } catch {
      if (mounted.current && current() && memory.current[operation]?.key === job.key) saveJob(operation, { ...job, readFailed: true });
    } finally { requestBusy.current = false; if (mounted.current) setReading(null); }
  }

  useEffect(() => {
    if (!visible) return;
    const pending = (['transcription', 'reply'] as const).filter(operation => {
      const job = jobs[operation];
      return job?.task && !job.readFailed && (job.task.status === 'pending' || job.task.status === 'running');
    });
    if (!pending.length) return;
    const timer = setTimeout(() => { for (const operation of pending) void recover(operation, jobs[operation]!); }, 1500);
    return () => clearTimeout(timer);
  }, [jobs, visible]);

  async function submit(operation: Operation, action: (key: string, signal: AbortSignal) => Promise<{ task: AgentTaskView }>) {
    if (sessionPreparation.current || requestBusy.current || unresolved(memory.current.transcription) || unresolved(memory.current.reply)) return;
    const job: VoiceSubmission = { key: crypto.randomUUID(), state: 'submitting', ...(operation === 'reply' ? { sourceTaskId: sourceTask?.id } : {}) };
    saveJob(operation, job); requestBusy.current = true; setMessage('');
    try {
      const response = await bounded(signal => action(job.key, signal));
      receive(operation, job.key, response.task);
    } catch (cause) {
      if (!current() || memory.current[operation]?.key !== job.key || memory.current[operation]?.state !== 'submitting') return;
      const rejected = cause instanceof ApiClientError && cause.status >= 400 && cause.status < 500 && ![408, 429].includes(cause.status);
      const next = { ...job, state: rejected ? 'rejected' as const : 'unknown' as const };
      saveJob(operation, next);
      if (mounted.current && !rejected) {
        // One GET can recover a lost POST response; it never creates paid work.
        try { const response = await bounded(signal => findVoiceSubmission(job.key, signal)); receive(operation, job.key, response.task); }
        catch { /* Unknown stays blocked until the original submission can be read. */ }
      }
    } finally { requestBusy.current = false; }
  }

  async function transcribeRecording() {
    const file = recorded.current;
    if (!file || sessionPreparation.current || requestBusy.current || unresolved(memory.current.transcription) || unresolved(memory.current.reply)) return;
    const preparation = Symbol(); sessionPreparation.current = preparation;
    setPreparingSession(true); setMessage('');
    let sessionId: string;
    try {
      // This existing, idempotent session prerequisite cannot start paid ASR work.
      sessionId = await ensureSession();
    } catch {
      if (mounted.current && current() && sessionPreparation.current === preparation) setMessage(t('sessionFailed'));
      return;
    } finally {
      if (sessionPreparation.current === preparation) {
        sessionPreparation.current = null;
        if (mounted.current) setPreparingSession(false);
      }
    }
    if (!mounted.current || !current() || document.hidden || recorded.current !== file) return;
    const submission = submit('transcription', (key, signal) => transcribeVoice(sessionId, file, key, signal));
    // Retire local media only once the paid submission actually begins.
    cancelLocal();
    await submission;
  }

  async function finishRecording() {
    const active = recorder.current;
    if (!active) return;
    setRecording('encoding');
    try {
      const file = await active.finish();
      if (!mounted.current || recorder.current !== active || document.hidden) return;
      recorded.current = file; setRecording('ready');
    } catch (cause) {
      if (mounted.current && recorder.current === active && !(cause instanceof DOMException && cause.name === 'AbortError')) {
        active.cancel(); recorder.current = null; setMessage(t('recordingFailed')); setRecording('idle');
      }
    }
  }

  async function startRecording() {
    if (recorder.current || disabled || !visible || unresolved(memory.current.transcription) || unresolved(memory.current.reply)) return;
    setMessage(''); setRecording('requesting'); setPendingTranscript(''); seenTranscript.current = '';
    saveJob('transcription', undefined);
    const active = new HermesVoiceRecorder(() => { if (recorder.current === active && mounted.current) void finishRecording(); });
    recorder.current = active;
    try {
      await active.start();
      if (!mounted.current || recorder.current !== active || document.hidden) { active.cancel(); return; }
      recordStarted.current = Date.now(); setSeconds(0); setRecording('recording');
    } catch (cause) {
      if (!mounted.current || recorder.current !== active) return;
      active.cancel(); recorder.current = null; setRecording('idle');
      setMessage(t(cause instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(cause.name) ? 'permissionDenied' : 'recordingFailed'));
    }
  }

  async function continueTask(operation: Operation, job: VoiceSubmission) {
    if (!job.task || requestBusy.current) return;
    requestBusy.current = true; setReading(operation);
    try { const response = await bounded(signal => resumeVoiceTask(job.task!.id, signal)); receive(operation, job.key, response.task); }
    catch { if (mounted.current && current() && memory.current[operation]?.key === job.key) saveJob(operation, { ...job, readFailed: true }); }
    finally { requestBusy.current = false; if (mounted.current) setReading(null); }
  }

  const voice = capabilities ? selectReplyVoice(capabilities, locale) : undefined;
  const paidBusy = unresolved(jobs.transcription) || unresolved(jobs.reply);
  const enabled = capabilities?.available === true && visible;
  const replySource = sourceTask?.kind === 'workspace.guide' && sourceTask.status === 'succeeded' ? sourceTask : null;
  const replyTooLong = Boolean(replySource && typeof replySource.result?.summary === 'string'
    && new TextEncoder().encode(replySource.result.summary).length > (capabilities?.replyMaxUtf8Bytes ?? 1000));
  const readyReply = jobs.reply?.sourceTaskId === replySource?.id && jobs.reply?.task && isVoiceReplyReady(jobs.reply.task) ? jobs.reply.task : null;
  const canApply = mergeVoiceTranscript({ scope, currentScope: memory.current.scope, currentDraft: draft, transcript: pendingTranscript }) !== null;

  useEffect(() => {
    const player = audio.current;
    return () => { if (player) { player.pause(); player.removeAttribute('src'); player.load(); } };
  }, [readyReply?.id]);

  return <section className={styles.controls} aria-label={t('label')} data-hermes-voice="true">
    <div className={styles.actions}>
      {recording === 'idle' && capabilities?.available && <button type="button" className={styles.secondary} onClick={() => void startRecording()} disabled={!enabled || !supported || disabled || paidBusy} aria-describedby="hermes-voice-cost">
        <Mic size={16} aria-hidden="true" />{t('start')}
      </button>}
      {recording === 'requesting' && <button type="button" className={styles.secondary} onClick={cancelLocal}>{t('cancelPermission')}</button>}
      {recording === 'recording' && <button type="button" className={styles.recording} onClick={() => void finishRecording()} aria-pressed="true">
        <Square size={14} aria-hidden="true" />{t('stop', { seconds })}
      </button>}
      {recording === 'encoding' && <span role="status">{t('preparing')}</span>}
      {recording === 'ready' && <>
        <button type="button" disabled={!enabled || disabled || paidBusy || preparingSession} aria-busy={preparingSession} onClick={() => void transcribeRecording()}>{t('transcribe')}</button>
        <button type="button" className={styles.secondary} onClick={cancelLocal}>{t('discard')}</button>
      </>}
      {preparingSession && <span role="status">{t('preparingSession')}</span>}
      {replySource && capabilities?.available && !readyReply && <button type="button" className={styles.secondary} disabled={!enabled || !voice || disabled || paidBusy || preparingSession || replyTooLong || !canReadReply(replySource, capabilities?.replyMaxUtf8Bytes ?? 1000)}
        onClick={() => { if (voice) void submit('reply', (key, signal) => createVoiceReply(replySource.id, voice.id, key, signal)); }}>
        <Volume2 size={16} aria-hidden="true" />{t('readReply')}
      </button>}
    </div>
    <p className={styles.hint} id="hermes-voice-cost">{!capabilities?.available ? t('unavailable') : !supported ? t('unsupported') : t('cost')}</p>
    {replyTooLong && capabilities?.available && <p className={styles.hint}>{t('replyTooLong')}</p>}
    {replySource && capabilities?.available && !voice && <p className={styles.hint}>{t('noVoice')}</p>}
    {(['transcription', 'reply'] as const).map(operation => {
      const job = jobs[operation]; if (!job || (job.state === 'known' && job.task?.status === 'succeeded' && !(operation === 'transcription' && !readVoiceTranscript(job.task)))) return null;
      const failed = job.state === 'rejected' || job.task?.status === 'failed';
      const unknown = job.state === 'unknown' || job.task?.result?.uncertain === true;
      return <div key={operation} className={styles.status} role={failed || unknown ? 'alert' : 'status'} aria-busy={job.state === 'submitting' || reading === operation}>
        <p>{t(unknown ? 'unknown' : job.readFailed ? 'readFailed' : failed ? 'failed' : job.task?.status === 'succeeded' ? 'transcriptInvalid' : operation === 'transcription' ? 'recognizing' : 'generatingReply')}</p>
        {(unknown || job.readFailed) && <button type="button" className={styles.secondary} disabled={reading !== null} onClick={() => void recover(operation, job)}>{t('query')}</button>}
        {job.task?.result?.canResume === true && <button type="button" className={styles.secondary} disabled={reading !== null} onClick={() => void continueTask(operation, job)}>{t('continue')}</button>}
      </div>;
    })}
    {pendingTranscript && <div className={styles.review}>
      <label htmlFor="hermes-voice-transcript">{t('review')}</label>
      <textarea id="hermes-voice-transcript" rows={2} maxLength={2000} value={pendingTranscript} onChange={event => setPendingTranscript(event.target.value)} />
      <button type="button" disabled={disabled || !canApply} onClick={() => {
        if (!onApply(pendingTranscript, scope)) { setMessage(t('draftFull')); return; }
        const job = memory.current.transcription; if (job) saveJob('transcription', { ...job, applied: true });
        setPendingTranscript(''); setMessage(t('applied'));
      }}>{t(draft ? 'append' : 'useTranscript')}</button>
      {!canApply && <p className={styles.hint}>{t('draftFull')}</p>}
    </div>}
    {readyReply && <div className={styles.playback}>
      <audio key={readyReply.id} ref={audio} hidden preload="none" src={voiceTaskAudioUrl(readyReply.id)} aria-label={t('audioLabel')}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setMessage(t('playbackFailed'))} />
      <button type="button" className={styles.secondary} disabled={playing} onClick={() => {
        void audio.current?.play().catch(() => { if (mounted.current) setMessage(t('playbackFailed')); });
      }}><Volume2 size={16} aria-hidden="true" />{t('playReply')}</button>
      <button type="button" className={styles.secondary} disabled={!playing} onClick={stopAudio}>{t('stopPlayback')}</button>
    </div>}
    {message && <p className={styles.hint} role="status">{message}</p>}
  </section>;
}
