import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nginx = readFileSync(new URL('./openscience.conf', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../scripts/deploy.sh', import.meta.url), 'utf8');

function locationBlock(signature) {
  const start = nginx.indexOf(signature);
  assert.notEqual(start, -1, `missing nginx location: ${signature}`);
  const end = nginx.indexOf('\n    }', start);
  assert.notEqual(end, -1, `unterminated nginx location: ${signature}`);
  return nginx.slice(start, end + 6);
}

test('browser /api namespace is stripped before Fastify', () => {
  assert.match(nginx, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001\/;/);
});

test('admin API keeps the same Basic Auth boundary as the admin surface', () => {
  assert.match(nginx, /location \^~ \/api\/admin\/ \{[\s\S]*?auth_basic "openscience-admin"/);
  assert.match(nginx, /location \^~ \/api\/admin\/ \{[\s\S]*?proxy_set_header Authorization "";/);
});

test('browser auth pages reach Next while direct auth APIs remain on Fastify', () => {
  assert.match(nginx, /location = \/auth\/login \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(nginx, /location = \/auth\/register \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(nginx, /location ~ \^\/\(auth\|agent\|sandbox-jobs\|versions\)\(\/\|\$\) \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001;/);
});

test('curator page enters the admin Basic Auth realm before Next', () => {
  const block = locationBlock('location ^~ /editorial/curator {');
  assert.match(block, /auth_basic "openscience-admin";/);
  assert.match(block, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(block, /proxy_set_header Authorization "";/);
});

test('nginx consumes Basic credentials before forwarding every protected admin surface', () => {
  const block = locationBlock('location /admin/ {');
  assert.match(block, /auth_basic "openscience-admin";/);
  assert.match(block, /proxy_set_header Authorization "";/);
});

test('Tunnel origin trusts only loopback CF client identity and sends one proxy hop', () => {
  assert.match(nginx, /set_real_ip_from 127\.0\.0\.1;/);
  assert.match(nginx, /real_ip_header CF-Connecting-IP;/);
  assert.doesNotMatch(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
});

test('every production deployment reconciles and validates the active nginx config', () => {
  assert.match(deploy, /install -m 0644 \$RELEASE_ROOT\/infra\/nginx\/openscience\.conf \$NGINX_CONF/);
  assert.doesNotMatch(deploy, /test -f \$NGINX_CONF \|\| cp/);
  assert.match(deploy, /nginx -t/);
});

test('public acceptance can bind evidence to the current immutable release', () => {
  assert.match(nginx, /location = \/__release \{[\s\S]*?alias \/opt\/openscience\/\.release-id;/);
  assert.match(nginx, /location = \/__release \{[\s\S]*?Cache-Control "no-store"/);
});
