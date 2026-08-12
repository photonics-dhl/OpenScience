import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const nginx = readFileSync(new URL('./openscience.conf', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../scripts/deploy.sh', import.meta.url), 'utf8');

test('browser /api namespace is stripped before Fastify', () => {
  assert.match(nginx, /location \/api\/ \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001\/;/);
});

test('browser auth pages reach Next while direct auth APIs remain on Fastify', () => {
  assert.match(nginx, /location = \/auth\/login \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(nginx, /location = \/auth\/register \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(nginx, /location ~ \^\/\(auth\|agent\|sandbox-jobs\|versions\)\(\/\|\$\) \{[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3001;/);
});

test('curator page enters the admin Basic Auth realm before Next', () => {
  assert.match(nginx, /location \^~ \/editorial\/curator \{[\s\S]*?auth_basic "openscience-admin";[\s\S]*?proxy_pass http:\/\/127\.0\.0\.1:3000;/);
});

test('Tunnel origin trusts only loopback CF client identity and sends one proxy hop', () => {
  assert.match(nginx, /set_real_ip_from 127\.0\.0\.1;/);
  assert.match(nginx, /real_ip_header CF-Connecting-IP;/);
  assert.doesNotMatch(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
});

test('every production deployment reconciles and validates the active nginx config', () => {
  assert.match(deploy, /install -m 0644 \$REMOTE_ROOT\/infra\/nginx\/openscience\.conf \$NGINX_CONF/);
  assert.doesNotMatch(deploy, /test -f \$NGINX_CONF \|\| cp/);
  assert.match(deploy, /nginx -t/);
});
