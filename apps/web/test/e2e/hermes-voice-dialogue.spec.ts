import { expect, test, type Page } from 'playwright/test';
import type { AgentTaskView } from '../../lib/api';

const sessionId = '10000000-0000-4000-8000-000000000001';
const transcriptionId = '10000000-0000-4000-8000-000000000002';
const guideId = '10000000-0000-4000-8000-000000000003';
const replyId = '10000000-0000-4000-8000-000000000004';
const makeTask = (id: string, kind: string, result: Record<string, unknown> | null, status: AgentTaskView['status'] = 'succeeded'): AgentTaskView => ({
  id, sessionId, kind, result, status, progress: status === 'succeeded' ? 100 : 0, retryCount: 0, canRetry: false,
  error: null, createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z',
});

async function fixture(page: Page, options: { unknown?: boolean; delayedPermission?: boolean; summary?: string; holdTranscript?: boolean; holdSession?: boolean; failFirstSession?: boolean } = {}) {
  const observed = { sessions: 0, sessionKeys: [] as string[], transcriptions: 0, replies: 0, guideBodies: [] as unknown[], queryKeys: [] as string[], postKeys: [] as string[], audioGets: 0, unmocked: [] as string[] };
  let recognized = false;
  let userId = 'voice-user';
  let releaseTranscript: (() => void) | undefined;
  let waitingForTranscript = false;
  let releaseSession: (() => void) | undefined;
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://127.0.0.1:3010' }]);
  await page.addInitScript(({ delayed }) => {
    const state = { requests: 0, stopped: 0, plays: 0, pauses: 0, grant: () => {} };
    (window as unknown as { __voice: typeof state }).__voice = state;
    const stream = { getTracks: () => [{ stop: () => { state.stopped += 1; } }] };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
      state.requests += 1;
      if (delayed) await new Promise<void>(resolve => { state.grant = resolve; });
      return stream;
    } } });
    class Recorder extends EventTarget {
      state = 'inactive'; mimeType = 'audio/webm';
      static isTypeSupported() { return true; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.dispatchEvent(new BlobEvent('dataavailable', { data: new Blob(['synthetic encoded sound']) }));
        this.dispatchEvent(new Event('stop'));
      }
    }
    class Decoder {
      async decodeAudioData() { return { sampleRate: 48_000, numberOfChannels: 1, getChannelData: () => new Float32Array(48_000) }; }
      async close() {}
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Decoder });
    HTMLMediaElement.prototype.play = async function () { state.plays += 1; this.dispatchEvent(new Event('play')); };
    HTMLMediaElement.prototype.pause = function () { state.pauses += 1; this.dispatchEvent(new Event('pause')); };
  }, { delayed: options.delayedPermission === true });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (path === '/api/auth/me') return json({ userId, email: 'voice@example.invalid', displayName: 'Researcher', status: 'email_verified', level: 'free' });
    if (path === '/api/workspaces') return json({ workspaces: [{ id: 'workspace-voice', name: 'Personal', type: 'personal', role: 'owner', status: 'active' }] });
    if (path === '/api/research-objects') return json({ researchObjects: [] });
    if (path === '/api/ingestion') return json({ tasks: [] });
    if (path === '/api/agent/tasks' && request.method() === 'GET') return json({ tasks: [] });
    if (path === '/api/csrf-token') return json({ csrfToken: 'voice-csrf' });
    if (path === '/api/agent/voice/capabilities') return json({ available: true, maxRecordingSeconds: 60, transcriptionCredits: 1, replyMaxUtf8Bytes: 1000,
      voices: [{ id: 'returned-en-voice', name: 'English', languages: ['en-US'], creditsPerRequest: 1 }] });
    if (path === '/api/agent/sessions' && request.method() === 'POST') {
      observed.sessions += 1; observed.sessionKeys.push(request.headers()['idempotency-key']);
      if (options.failFirstSession && observed.sessions === 1) return json({ error: { code: 'SESSION_UNAVAILABLE', message: 'Session creation unavailable' } }, 500);
      if (options.holdSession) await new Promise<void>(resolve => { releaseSession = resolve; });
      return json({ session: { id: sessionId } }, 201);
    }
    if (path === '/api/agent/voice/transcriptions' && request.method() === 'POST') {
      observed.transcriptions += 1; observed.postKeys.push(request.headers()['idempotency-key']);
      if (options.unknown) return route.abort('timedout');
      return json({ task: makeTask(transcriptionId, 'voice.transcribe', null, 'running') }, 202);
    }
    if (path === `/api/agent/voice/tasks/${transcriptionId}`) {
      if (options.holdTranscript) { waitingForTranscript = true; await new Promise<void>(resolve => { releaseTranscript = resolve; }); }
      return json({ task: makeTask(transcriptionId, 'voice.transcribe', recognized ? { operation: 'transcription', transcript: 'Explain the optical result' } : null, recognized ? 'succeeded' : 'running') });
    }
    if (path.startsWith('/api/agent/voice/submissions/')) { observed.queryKeys.push(path.split('/').at(-1)!); return json({ error: { code: 'NOT_FOUND', message: 'Still unknown' } }, 404); }
    if (path === '/api/agent/tasks' && request.method() === 'POST') {
      observed.guideBodies.push(request.postDataJSON());
      return json({ task: makeTask(guideId, 'workspace.guide', { summary: options.summary ?? 'This is the optical result.', needsMoreInformation: false, nextSteps: [] }) }, 202);
    }
    if (path === '/api/agent/voice/replies' && request.method() === 'POST') {
      observed.replies += 1; expect(request.postDataJSON()).toEqual({ sourceTaskId: guideId, voiceId: 'returned-en-voice' });
      return json({ task: makeTask(replyId, 'voice.reply', { operation: 'reply', audioReady: true, spokenText: 'This is the optical result.' }) }, 202);
    }
    if (path.endsWith('/audio')) { observed.audioGets += 1; return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('synthetic audio fixture') }); }
    observed.unmocked.push(`${request.method()} ${path}${url.search}`);
    return json({ error: { code: 'FIXTURE_UNDECLARED', message: 'Undeclared fixture request' } }, 404);
  });
  await page.goto('/dashboard?hermes-motion=reduced', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeEnabled();
  return { observed, recognize: () => { recognized = true; }, waiting: () => waitingForTranscript,
    release: () => releaseTranscript?.(), releaseSession: () => releaseSession?.(), changeAccount: async () => {
      userId = 'voice-other';
      await page.evaluate(() => window.dispatchEvent(new Event('openscience-session-changed')));
    } };
}

async function microphoneState(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __voice: { requests: number; stopped: number; plays: number; pauses: number } }).__voice;
    return { requests: state.requests, stopped: state.stopped, plays: state.plays, pauses: state.pauses };
  });
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`synthetic voice review uses the same Hermes message flow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { observed, recognize } = await fixture(page);
    expect((await microphoneState(page)).requests).toBe(0);
    const composer = page.locator('#hermes-guide-goal');
    await composer.fill('Keep my draft');
    await page.getByRole('button', { name: 'Voice input', exact: true }).click();
    await page.getByRole('button', { name: /Stop recording/ }).click();
    await expect(page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true })).toBeVisible();
    expect(observed.transcriptions).toBe(0);
    await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
    await composer.fill('User edited during recognition'); recognize();
    const transcript = page.getByRole('textbox', { name: 'Review and edit the transcript' });
    await expect(transcript).toHaveValue('Explain the optical result');
    await page.screenshot({ path: `../../tmp/hermes-voice-dialogue/review-${viewport.width}.png` });
    expect(observed.guideBodies).toHaveLength(0);
    await transcript.fill('Explain the optical result clearly');
    await page.getByRole('button', { name: 'Append to message', exact: true }).click();
    await expect(composer).toHaveValue('User edited during recognition\nExplain the optical result clearly');
    await expect(composer).toBeFocused();
    await page.getByRole('button', { name: /^Send/ }).click();
    await expect(page.getByText('This is the optical result.', { exact: true })).toBeVisible();
    expect(observed.sessions).toBe(1); expect(observed.transcriptions).toBe(1);
    expect(observed.guideBodies).toMatchObject([{ kind: 'workspace.guide', payload: { goal: 'User edited during recognition\nExplain the optical result clearly' } }]);
    await page.getByRole('button', { name: 'Read reply · 1 AI point', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Play reply', exact: true })).toBeVisible();
    expect((await microphoneState(page)).plays).toBe(0); expect(observed.audioGets).toBe(0);
    await page.getByRole('button', { name: 'Play reply', exact: true }).click();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    expect((await microphoneState(page)).plays).toBe(1);
    expect(observed.replies).toBe(1); expect(observed.unmocked).toEqual([]);
    const bounds = await page.locator('[data-hermes-voice="true"]').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  });
}

test('unknown paid submission preserves its key across close and only queries the original request', async ({ page }) => {
  const { observed } = await fixture(page, { unknown: true });
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect(page.getByText(/submission is unconfirmed/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Check original submission', exact: true }).click();
  await expect.poll(() => observed.queryKeys.length).toBe(2);
  expect(observed.postKeys).toHaveLength(1); expect(new Set(observed.queryKeys)).toEqual(new Set(observed.postKeys));
  expect(observed.unmocked).toEqual([]);
});

test('closing while microphone permission is pending stops a late grant', async ({ page }) => {
  await fixture(page, { delayedPermission: true });
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel recording', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __voice: { grant(): void } }).__voice.grant());
  await expect.poll(async () => (await microphoneState(page)).stopped).toBe(1);
});

test('hiding the tab releases microphone tracks and does not submit audio', async ({ page }) => {
  const { observed } = await fixture(page);
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await expect(page.getByRole('button', { name: /Stop recording/ })).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await microphoneState(page)).stopped).toBe(1);
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeDisabled();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeEnabled();
  expect(observed.transcriptions).toBe(0);
});

test('an account change cannot apply a late transcript to the next owner draft', async ({ page }) => {
  const { observed, recognize, waiting, release, changeAccount } = await fixture(page, { holdTranscript: true });
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect.poll(waiting).toBe(true);
  await changeAccount();
  await expect(page.getByRole('button', { name: 'Voice input', exact: true })).toBeEnabled();
  await page.locator('#hermes-guide-goal').fill('Next owner private draft'); recognize(); release();
  await expect(page.getByRole('textbox', { name: 'Review and edit the transcript' })).toHaveCount(0);
  await expect(page.locator('#hermes-guide-goal')).toHaveValue('Next owner private draft');
  expect(observed.transcriptions).toBe(1);
});

test('concurrent transcription and normal text submission share one session creation', async ({ page }) => {
  const { observed, releaseSession } = await fixture(page, { holdSession: true });
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect.poll(() => observed.sessions).toBe(1);
  await page.locator('#hermes-guide-goal').fill('Send my existing text while speech is pending');
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect(page.locator('#hermes-guide-goal')).toBeDisabled();
  expect(observed.sessions).toBe(1); releaseSession();
  await expect.poll(() => observed.transcriptions).toBe(1);
  await expect.poll(() => observed.guideBodies.length).toBe(1);
  expect(observed.sessions).toBe(1); expect(observed.unmocked).toEqual([]);
});

test('reopening a known pending transcription presents its result when the same task completes', async ({ page }) => {
  const { observed, recognize } = await fixture(page);
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect(page.getByText('Recognizing speech…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close Hermes', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation', exact: true }).click();
  recognize();
  await expect(page.getByRole('textbox', { name: 'Review and edit the transcript' })).toHaveValue('Explain the optical result');
  expect(observed.transcriptions).toBe(1);
  expect(observed.guideBodies).toHaveLength(0);
  expect(observed.unmocked).toEqual([]);
});

test('a session prerequisite failure retains the recording for a safe retry before any paid transcription POST', async ({ page }) => {
  const { observed, recognize } = await fixture(page, { failFirstSession: true });
  await page.locator('#hermes-guide-goal').fill('Existing draft');
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await page.getByRole('button', { name: /Stop recording/ }).click();
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect.poll(() => observed.sessions).toBe(1);
  expect(observed.transcriptions).toBe(0);
  await expect(page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true })).toBeEnabled();
  await expect(page.getByText(/submission is unconfirmed/)).toHaveCount(0);
  expect(observed.queryKeys).toEqual([]);
  await page.getByRole('button', { name: 'Transcribe · 1 AI point', exact: true }).click();
  await expect.poll(() => observed.transcriptions).toBe(1);
  expect(observed.sessions).toBe(2); expect(new Set(observed.sessionKeys).size).toBe(1);
  expect((await microphoneState(page)).requests).toBe(1);
  recognize();
  await expect(page.getByRole('textbox', { name: 'Review and edit the transcript' })).toHaveValue('Explain the optical result');
  await page.getByRole('button', { name: 'Append to message', exact: true }).click();
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect.poll(() => observed.guideBodies.length).toBe(1);
  expect(observed.guideBodies).toMatchObject([{ kind: 'workspace.guide', payload: { goal: 'Existing draft\nExplain the optical result' } }]);
  expect(observed.unmocked).toEqual([]);
});

test('a long Chinese reply remains readable and cannot be silently truncated into speech', async ({ page }) => {
  const { observed } = await fixture(page, { summary: '研'.repeat(334) });
  await page.locator('#hermes-guide-goal').fill('Give the full explanation');
  await page.getByRole('button', { name: /^Send/ }).click();
  await expect(page.getByText('研'.repeat(334), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read reply · 1 AI point', exact: true })).toBeDisabled();
  await expect(page.getByText(/This reply exceeds the speech limit/)).toBeVisible();
  expect(observed.replies).toBe(0); expect(observed.unmocked).toEqual([]);
});
