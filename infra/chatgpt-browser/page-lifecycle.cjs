// Only use under the caller's provider lock. Never infer page ownership from its URL.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { isDeepStrictEqual } = require('node:util');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET = /^[A-F0-9]{32}$/i;
const RECORD = /^browser-target-([0-9a-f-]{36})\.([A-F0-9]{32})\.json$/i;
function readJson(file, maximum = 32768) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw Error('INVALID_PAGE_RECORD');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function once(file, value) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function localCdp(route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port: 9233, path: route }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { request.destroy(); reject(Error('CDP_RESPONSE_TOO_LARGE')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => response.statusCode === 200
        ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(Error('CDP_UNAVAILABLE')));
    });
    const timer = setTimeout(() => request.destroy(Error('CDP_TIMEOUT')), 2000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}
async function browserInstance() {
  const version = JSON.parse(await localCdp('/json/version'));
  const endpoint = new URL(version.webSocketDebuggerUrl);
  const instance = endpoint.pathname.replace('/devtools/browser/', '');
  if (!UUID.test(instance)) throw Error('INVALID_BROWSER_INSTANCE');
  return instance;
}
async function rememberPage(page, jobDir, provider, id, instance) {
  if (!UUID.test(id) || !UUID.test(instance)) throw Error('INVALID_PAGE_RECORD');
  const session = await page.context().newCDPSession(page);
  let target;
  try { target = (await session.send('Target.getTargetInfo')).targetInfo.targetId; }
  finally { await session.detach(); }
  if (!TARGET.test(target)) throw Error('INVALID_PAGE_RECORD');
  const file = path.join(jobDir, `browser-target-${instance}.${target}.json`);
  const record = { id, provider, instance, target };
  if (fs.existsSync(file)) {
    if (!isDeepStrictEqual(readJson(file, 2048), record)) throw Error('PAGE_RECORD_CHANGED');
  } else once(file, record);
}
function reclaimReason(jobDir, id, provider, targetUrl) {
  const request = readJson(path.join(jobDir, 'request.json'), 96 * 1024);
  if (request.id !== id || request.provider !== provider || !Number.isSafeInteger(request.deadlineAt)) return null;
  if (!fs.existsSync(path.join(jobDir, 'submitted.json'))) {
    // An unexpired prepared page can still be used; leave it intact.
    const errorFile = path.join(jobDir, 'operator-error.json');
    const failed = fs.existsSync(errorFile) && readJson(errorFile).state === 'not_submitted';
    // A Chat page may contain a prepared prompt or a later human draft. The job
    // ledger cannot prove its live contents are disposable before attaching.
    return (failed || request.deadlineAt <= Date.now()) && targetUrl === 'about:blank'
      ? 'finished_before_submission' : null;
  }
  // A saved result does not rule out subsequent user input in that conversation.
  // Normal runners close their own completed pages; retain exceptional leftovers.
  return null;
}
async function beforeAttach(root, provider, currentId) {
  const instance = await browserInstance();
  const targets = JSON.parse(await localCdp('/json/list'));
  if (!Array.isArray(targets)) throw Error('INVALID_CDP_TARGETS');
  const started = Date.now(); let closed = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (Date.now() - started > 6000 || closed >= 6) break;
    if (!entry.isDirectory() || !UUID.test(entry.name) || entry.name === currentId) continue;
    const jobDir = path.join(root, entry.name);
    for (const name of fs.readdirSync(jobDir)) {
      if (Date.now() - started > 6000 || closed >= 6) break;
      const match = RECORD.exec(name);
      if (!match || match[1] !== instance) continue;
      try {
        const record = readJson(path.join(jobDir, name), 2048);
        if (!isDeepStrictEqual(record, { id: entry.name, provider, instance, target: match[2] })) continue;
        const matching = targets.filter(target => target.id === record.target && target.type === 'page');
        if (matching.length !== 1) continue;
        const reason = reclaimReason(jobDir, entry.name, provider, matching[0].url);
        if (!reason) continue;
        await localCdp('/json/close/' + record.target);
        // Chrome acknowledges close before the target disappears from its inventory.
        const confirmationDeadline = Date.now() + 1500;
        let remaining;
        do {
          remaining = JSON.parse(await localCdp('/json/list'));
          if (!Array.isArray(remaining) || !remaining.some(target => target.id === record.target)) break;
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (Date.now() < confirmationDeadline);
        if (!Array.isArray(remaining) || remaining.some(target => target.id === record.target)) continue;
        const audit = path.join(jobDir, name.replace(/\.json$/, '.closed.json'));
        if (!fs.existsSync(audit)) once(audit, { ...record, reason, at: new Date().toISOString() });
        closed += 1;
      } catch { /* Incomplete or unfamiliar ownership evidence must not trigger broader cleanup. */ }
    }
  }
  return instance;
}
module.exports = { beforeAttach, rememberPage };
