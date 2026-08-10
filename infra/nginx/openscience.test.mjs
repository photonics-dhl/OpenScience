import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./openscience.conf', import.meta.url), 'utf8');

test('curator page obtains the admin Basic Auth realm before loading the web workbench', () => {
  assert.match(source, /location \^~ \/editorial\/curator \{[\s\S]*?auth_basic "openscience-admin";[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test('admin APIs retain the same realm and terminate at Fastify', () => {
  assert.match(source, /location \/admin\/ \{[\s\S]*?auth_basic "openscience-admin";[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001;/);
});
