import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composeUrl = new URL('./docker-compose.prod.yml', import.meta.url);

test('voice credentials are opt-in and confined to read-only API and Worker directories', async () => {
  const compose = (await readFile(composeUrl, 'utf8')).replaceAll('\r\n', '\n');
  const mount = '- /opt/openscience-synclip/voice-secrets:/run/openscience-voice:ro';
  const configured = 'SYNCLIP_API_KEY_FILE: ${SYNCLIP_VOICE_API_KEY_FILE:-}';
  for (const name of ['api', 'agent-worker']) {
    const service = compose.split(`\n  ${name}:\n`, 2)[1]?.split(/\n {2}[a-zA-Z0-9_-]+:\n/u, 1)[0] ?? '';
    assert.ok(service.includes(mount));
    assert.ok(service.includes(configured), 'No credential path is enabled by default');
    assert.doesNotMatch(service, /SYNCLIP_API_KEY:\s*[^\n]+/u);
  }
  assert.equal(compose.split(mount).length - 1, 2, 'Other services do not receive voice credentials');
  assert.doesNotMatch(compose, /\/opt\/openscience-synclip\/api-key:/u, 'Original host credential stays private');
});

test('API observes video readiness through only the existing read-only results directory', async () => {
  const compose = (await readFile(composeUrl, 'utf8')).replaceAll('\r\n', '\n');
  const api = compose.split('\n  api:\n', 2)[1]?.split(/\n {2}[a-zA-Z0-9_-]+:\n/u, 1)[0] ?? '';
  const mounts = api.match(/^\s+- \/opt\/openscience-synclip-video[^\n]*/gmu) ?? [];
  assert.deepEqual(mounts.map(line => line.trim()), ['- /opt/openscience-synclip-video/spool/results:/synclip-video-jobs/results:ro']);
  assert.ok(api.includes('SYNCLIP_VIDEO_ENABLED: ${SYNCLIP_VIDEO_ENABLED:-false}'));
  assert.ok(api.includes('SYNCLIP_VIDEO_INBOX_DIR: /synclip-video-jobs/inbox'));
  assert.ok(api.includes('SYNCLIP_VIDEO_RESULTS_DIR: /synclip-video-jobs/results'));
});

test('production compose provides private persistent S3-compatible storage', async () => {
  const compose = (await readFile(composeUrl, 'utf8')).replaceAll('\r\n', '\n');
  assert.match(compose, /\n  object-storage:\n/);
  assert.match(compose, /image: chrislusf\/seaweedfs:4\.41(?:@sha256:[a-f0-9]{64})?/);
  assert.match(compose, /command: \["mini", "-dir=\/data"\]/);
  assert.match(compose, /AWS_ACCESS_KEY_ID: \$\{S3_ACCESS_KEY:\?S3_ACCESS_KEY required\}/);
  assert.match(compose, /AWS_SECRET_ACCESS_KEY: \$\{S3_SECRET_KEY:\?S3_SECRET_KEY required\}/);
  assert.match(compose, /S3_BUCKET: \$\{S3_BUCKET:\?S3_BUCKET required\}/);
  assert.match(compose, /- seaweed-data:\/data/);
  assert.match(compose, /object-storage:\n\s+condition: service_healthy/);
  assert.match(compose, /\n  seaweed-data:\n/);

  const service = compose.split('\n  object-storage:\n', 2)[1]?.split('\n  api:\n', 1)[0] ?? '';
  assert.doesNotMatch(service, /\n\s+ports:/);
  assert.match(service, /networks:\n\s+- data_net/);
  assert.doesNotMatch(service, /- app_net/);
});

test('Next server-side public reads use the API service on the app network', async () => {
  const compose = (await readFile(composeUrl, 'utf8')).replaceAll('\r\n', '\n');
  const web = compose.split('\n  web:\n', 2)[1]?.split('\nnetworks:\n', 1)[0] ?? '';
  assert.match(web, /environment:\n\s+API_ORIGIN: http:\/\/api:3001/);
  assert.match(web, /depends_on:\n\s+api:\n\s+condition: service_healthy/);
  assert.match(web, /networks:\n\s+- app_net/);
});

test('Web uses the Web Streams-safe runtime while API keeps the Prisma-compatible runtime', async () => {
  const compose = (await readFile(composeUrl, 'utf8')).replaceAll('\r\n', '\n');
  const workerDockerfile = (await readFile(new URL('../../apps/agent-worker/Dockerfile', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const api = compose.split('\n  api:\n', 2)[1]?.split(/\n {2}[a-zA-Z0-9_-]+:\n/u, 1)[0] ?? '';
  const web = compose.split('\n  web:\n', 2)[1]?.split('\nnetworks:\n', 1)[0] ?? '';
  assert.match(api, /\n\s+image: node:22\n/u);
  assert.match(web, /\n\s+image: node:24-bookworm@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0\n/u);
  assert.match(workerDockerfile, /^FROM node:22-bookworm\n/u);
});
