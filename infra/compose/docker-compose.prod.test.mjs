import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composeUrl = new URL('./docker-compose.prod.yml', import.meta.url);

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
