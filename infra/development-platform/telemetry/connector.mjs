import postgres from 'postgres';
import { open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// Only this standalone infrastructure process imports the SQL client. No Gateway,
// provider, application worker, content parser or LLM code is loaded or invoked.
const DAY = 86_400_000;
const PAGE_SIZE = 50;
const POLL_MS = 60_000;
const COMMIT_LAG_MS = 120_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const statePath = '/var/lib/gateway-telemetry/checkpoint.json';
const langfuseOrigin = 'http://development-langfuse-web:3000';
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

function safeNumber(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function choice(value, values) { return values.includes(value) ? value : null; }
function safeIdentifier(value, max) {
  return typeof value === 'string' && value.length <= max && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value) ? value : null;
}
function safeHash(value) { return typeof value === 'string' && HASH.test(value) ? value : null; }
function safeError(value) {
  return typeof value === 'string' && (/^provider_http_[1-5][0-9]{2}$/.test(value)
    || ['provider_timeout', 'provider_http', 'provider_response_json', 'provider_response_shape',
      'provider_empty', 'provider_error', 'provider_response_invalid', 'provider_disabled',
      'provider_unavailable', 'scientific_review_failed', 'image_provider_failed', 'other_failure'].includes(value))
    ? value : null;
}

// Second explicit allowlist: a future expansion of the database view must not
// silently expand the data exported to Langfuse. Never spread the source object.
function sanitize(source) {
  const s = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    operation: choice(s.operation, ['text', 'ocr', 'image', 'scientific_review']),
    provider: safeIdentifier(s.provider, 80),
    model: ['chatgpt-web/6-pro', 'chatgpt-web/6-pro-image-generation-tool'].includes(s.model)
      ? s.model : safeIdentifier(s.model, 128),
    outcome: choice(s.outcome, ['succeeded', 'failed']),
    inputTokens: safeNumber(s.inputTokens), outputTokens: safeNumber(s.outputTokens),
    estimatedInputTokens: safeNumber(s.estimatedInputTokens), estimatedOutputTokens: safeNumber(s.estimatedOutputTokens),
    estimatedCostUsdMicros: safeNumber(s.estimatedCostUsdMicros), actualCostUsdMicros: safeNumber(s.actualCostUsdMicros),
    currency: choice(s.currency, ['USD']), latencyMs: safeNumber(s.latencyMs),
    totalLatencyMs: safeNumber(s.totalLatencyMs), retryCount: safeNumber(s.retryCount),
    finishReason: choice(s.finishReason, ['stop', 'length', 'other', 'unknown']), errorCategory: safeError(s.errorCategory),
    promptHash: safeHash(s.promptHash), inputContentHash: safeHash(s.inputContentHash),
    requestCorrelation: typeof s.requestCorrelation === 'string' && UUID.test(s.requestCorrelation) ? s.requestCorrelation : null,
  };
}
function attribute(key, value) {
  return { key, value: typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) } };
}
function spanFor(row) {
  if (!UUID.test(row.id) || !Number.isFinite(Date.parse(row.recorded_at))) throw new Error('source_row_invalid');
  const metadata = sanitize(row.safe_metadata);
  const traceId = row.id.replaceAll('-', '');
  const spanId = traceId.slice(0, 16); // Unique together with its full audit-derived trace ID.
  const endMs = Date.parse(row.recorded_at);
  const duration = metadata.latencyMs !== null && metadata.latencyMs <= endMs ? metadata.latencyMs : null;
  const startMs = duration === null ? endMs : endMs - duration;
  const attrs = [
    attribute('langfuse.observation.type', 'generation'),
    attribute('langfuse.trace.name', 'ai.gateway.call'),
    attribute('langfuse.environment', 'production-audit-metadata'),
    attribute('langfuse.observation.level', metadata.outcome === 'failed' ? 'ERROR' : 'DEFAULT'),
    attribute('langfuse.observation.metadata.auditId', row.id),
    attribute('langfuse.observation.metadata.auditRecordedAt', row.recorded_at),
    attribute('langfuse.observation.metadata.timingBasis', duration === null ? 'audit_record_time_only' : 'audit_record_time_minus_reported_latency'),
    ...Object.entries(metadata).map(([key, value]) => attribute(`langfuse.observation.metadata.${key}`, value === null ? 'unknown' : value)),
  ];
  // Never set a model attribute recognized by Langfuse: doing so enables automatic
  // pricing of unknown source costs. The real model remains filterable metadata.
  const usage = {};
  if (metadata.inputTokens !== null) usage.input = metadata.inputTokens;
  if (metadata.outputTokens !== null) usage.output = metadata.outputTokens;
  if (Object.keys(usage).length) attrs.push(attribute('langfuse.observation.usage_details', JSON.stringify(usage)));
  if (metadata.currency === 'USD' && metadata.actualCostUsdMicros !== null) {
    attrs.push(attribute('langfuse.observation.cost_details', JSON.stringify({ total: metadata.actualCostUsdMicros / 1_000_000 })));
  }
  if (metadata.errorCategory) attrs.push(attribute('langfuse.observation.status_message', metadata.errorCategory));
  return {
    traceId, spanId, name: 'ai.gateway.call', kind: 3,
    startTimeUnixNano: (BigInt(startMs) * 1_000_000n).toString(),
    endTimeUnixNano: (BigInt(endMs) * 1_000_000n).toString(),
    attributes: attrs, status: { code: metadata.outcome === 'failed' ? 2 : 0 },
  };
}

async function save(state) {
  const bytes = JSON.stringify(state);
  if (bytes.length > 16_000_000) throw new Error('checkpoint_capacity');
  const file = await open(`${statePath}.next`, 'w', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(`${statePath}.next`, statePath);
  const directory = await open(dirname(statePath), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
async function loadState(initialize = false) {
  let raw;
  try { raw = await readFile(statePath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT' || !initialize) throw new Error('checkpoint_unreadable');
    const floor = new Date(Date.now() - DAY).toISOString();
    const state = { floor, completedThrough: floor, scan: null, pending: null, receipts: {} };
    await save(state);
    return state;
  }
  const state = JSON.parse(raw);
  if (!validTime(state.floor) || !validTime(state.completedThrough) || !state.receipts
    || typeof state.receipts !== 'object' || Array.isArray(state.receipts)
    || Object.entries(state.receipts).some(([id, at]) => !UUID.test(id) || !validTime(at))
    || (state.scan && (!validTime(state.scan.from) || !validTime(state.scan.to)
      || !validTime(state.scan.afterAt) || !UUID.test(state.scan.afterId)))
    || (state.pending && (!UUID.test(state.pending.id) || !validTime(state.pending.recordedAt)
      || !validTime(state.pending.startAt) || !validTime(state.pending.endAt)))) throw new Error('checkpoint_invalid');
  return state; // Never silently reset a damaged or missing receipt history.
}
async function jsonResponse(response) {
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > 262_144) throw new Error('response_too_large');
    chunks.push(chunk);
  }
  const value = Buffer.concat(chunks).toString('utf8');
  return value.length ? JSON.parse(value) : {};
}
async function acceptedReceipt(state, id, at) {
  state.receipts[id] = at;
  state.pending = null;
  await save(state);
}

async function reconcilePending(state, headers) {
  const p = state.pending;
  const traceId = p.id.replaceAll('-', '');
  const query = new URLSearchParams({
    traceId, fields: 'core', limit: '2',
    fromStartTime: new Date(Date.parse(p.startAt) - 1_000).toISOString(),
    toStartTime: new Date(Date.parse(p.endAt) + 1_000).toISOString(),
  });
  const response = await fetch(`${langfuseOrigin}/api/public/v2/observations?${query}`, {
    headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('reconciliation_unavailable');
  const result = await jsonResponse(response);
  const matches = Array.isArray(result.data) ? result.data.filter((r) => r.traceId === traceId && r.id === traceId.slice(0, 16)) : [];
  if (matches.length !== 1 || result.meta?.cursor) throw new Error('delivery_needs_reconciliation');
  await acceptedReceipt(state, p.id, p.recordedAt);
}

async function sendRow(row, state, headers) {
  if (Object.hasOwn(state.receipts, row.id)) return;
  const span = spanFor(row);
  // Persist BEFORE POST. An interrupted or timed-out request may have committed.
  // v4 cannot deduplicate resends: subsequent runs query, never blindly resend.
  state.pending = {
    id: row.id, recordedAt: row.recorded_at,
    startAt: new Date(Number(BigInt(span.startTimeUnixNano) / 1_000_000n)).toISOString(),
    endAt: row.recorded_at,
  };
  await save(state);
  const response = await fetch(`${langfuseOrigin}/api/public/otel/v1/traces`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'x-langfuse-ingestion-version': '4' },
    body: JSON.stringify({ resourceSpans: [{
      resource: { attributes: [attribute('service.name', 'openscience-gateway-audit')] },
      scopeSpans: [{ scope: { name: 'openscience.gateway-audit', version: '0.1.0' }, spans: [span] }],
    }] }),
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  // These explicit request rejections did not accept a span. Retain all other
  // non-success/partial/timeout outcomes as ambiguous until the read API finds it.
  if ([400, 401, 403, 404, 413, 415, 422, 429].includes(response.status)) {
    await response.body?.cancel();
    state.pending = null;
    await save(state);
    throw new Error(response.status === 429 ? 'ingestion_rate_limited' : 'ingestion_rejected');
  }
  if (response.status !== 200) { await response.body?.cancel(); throw new Error('delivery_needs_reconciliation'); }
  const result = await jsonResponse(response);
  // Any reported partial success is ambiguous for a one-span request.
  if (result.partialSuccess && (Number(result.partialSuccess.rejectedSpans ?? 0) !== 0
    || result.partialSuccess.errorMessage)) throw new Error('delivery_needs_reconciliation');
  await acceptedReceipt(state, row.id, row.recorded_at);
}

async function cycle(sql, state, headers) {
  if (state.pending) await reconcilePending(state, headers);
  if (!state.scan) {
    const from = new Date(Math.max(Date.parse(state.floor), Date.parse(state.completedThrough) - DAY)).toISOString();
    const to = new Date(Date.now() - COMMIT_LAG_MS).toISOString();
    state.scan = { from, to, afterAt: from, afterId: ZERO_UUID };
    await save(state);
  }
  const scan = state.scan;
  const rows = await sql`
    SELECT id::text, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS recorded_at, safe_metadata
    FROM xgs_telemetry.gateway_calls
    WHERE created_at >= ${scan.from}::timestamp AND created_at < ${scan.to}::timestamp
      AND (created_at, id) > (${scan.afterAt}::timestamp, ${scan.afterId}::uuid)
    ORDER BY created_at, id LIMIT ${PAGE_SIZE}`;
  for (const row of rows) {
    if (stopping) return;
    await sendRow(row, state, headers);
    scan.afterAt = row.recorded_at;
    scan.afterId = row.id;
  }
  if (rows.length < PAGE_SIZE) {
    state.completedThrough = scan.to;
    state.scan = null;
    // Keep receipts for the entire next overlap window, independent of wall time
    // or downtime. A record cannot be re-exported because its receipt aged first.
    const receiptFloor = Date.parse(state.completedThrough) - DAY;
    for (const [id, at] of Object.entries(state.receipts)) if (Date.parse(at) < receiptFloor) delete state.receipts[id];
  }
  await save(state);
  if (rows.length) console.info(JSON.stringify({ event: 'gateway_audit_page_processed', rows: rows.length }));
}

async function main() {
  const databaseUrl = process.env.GATEWAY_AUDIT_DATABASE_URL;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!databaseUrl || !publicKey || !secretKey) throw new Error('configuration_missing');
  const db = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.username !== 'xgs_gateway_telemetry'
    || db.hostname !== 'development-gateway-audit-db' || db.pathname !== '/openscience'
    || (db.port && db.port !== '5432') || db.search || db.hash) throw new Error('configuration_invalid');
  const sql = postgres(databaseUrl, {
    max: 1, prepare: false, connect_timeout: 5, idle_timeout: 10, ssl: false,
    connection: { application_name: 'gateway-audit-telemetry', default_transaction_read_only: 'on',
      statement_timeout: '3000', lock_timeout: '500', timezone: 'UTC' },
    onnotice: () => {}, debug: false,
  });
  const headers = { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}` };
  let state = await loadState(true);
  let failures = 0;
  try {
    while (!stopping) {
      try { await cycle(sql, state, headers); failures = 0; }
      catch (error) {
        failures++;
        // Do not log exception details, SQL parameters, URLs, response bodies or
        // credentials. Only constant adapter categories reach Docker logs.
        const category = ['delivery_needs_reconciliation', 'reconciliation_unavailable', 'ingestion_rate_limited',
          'ingestion_rejected', 'source_row_invalid', 'checkpoint_capacity'].includes(error.message)
          ? error.message : 'adapter_unavailable';
        console.error(JSON.stringify({ event: category, sourceApplicationUnaffected: true }));
        // In-memory progress may be ahead of a failed checkpoint fsync. Reload
        // durable receipts before any next send; an unreadable checkpoint is fatal.
        state = await loadState();
      }
      const delay = failures ? Math.min(POLL_MS * 2 ** Math.min(failures - 1, 4), 900_000) : POLL_MS;
      for (let left = delay; !stopping && left > 0; left -= 1_000) await sleep(Math.min(1_000, left));
    }
  } finally { await sql.end({ timeout: 5 }); }
}

main().catch(() => {
  console.error(JSON.stringify({ event: 'adapter_stopped', sourceApplicationUnaffected: true }));
  process.exitCode = 1;
});
