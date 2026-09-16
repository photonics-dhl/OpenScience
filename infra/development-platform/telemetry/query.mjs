// Read at most ten existing Gateway observations through the official v2 API.
// --task <UUID> follows the existing task correlation, not a new trace identity.
// No SQL, ingestion, models, arbitrary URLs, response bodies or credentials are logged.
// https://langfuse.com/docs/api-and-data-platform/features/observations-api
const origin = 'http://development-langfuse-web:3000';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const unknown = 'unknown';
function number(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : unknown;
}
function integer(value) { return Number.isSafeInteger(value) && value >= 0 ? value : unknown; }
function choice(value, values) { return values.includes(value) ? value : unknown; }
function identifier(value, max) {
  return typeof value === 'string' && value.length <= max && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value) ? value : unknown;
}
function matching(value, pattern) { return typeof value === 'string' && pattern.test(value) ? value : unknown; }
function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : unknown;
}
function metadata(source) {
  const s = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  return {
    auditId: matching(s.auditId, UUID), auditRecordedAt: timestamp(s.auditRecordedAt),
    operation: choice(s.operation, ['text', 'ocr', 'image', 'scientific_review']),
    provider: identifier(s.provider, 80),
    model: ['chatgpt-web/6-pro', 'chatgpt-web/6-pro-image-generation-tool'].includes(s.model)
      ? s.model : identifier(s.model, 128),
    outcome: choice(s.outcome, ['succeeded', 'failed']),
    inputTokens: integer(s.inputTokens), outputTokens: integer(s.outputTokens),
    estimatedInputTokens: integer(s.estimatedInputTokens), estimatedOutputTokens: integer(s.estimatedOutputTokens),
    actualCostUsdMicros: integer(s.actualCostUsdMicros), estimatedCostUsdMicros: integer(s.estimatedCostUsdMicros),
    currency: choice(s.currency, ['USD']), latencyMs: integer(s.latencyMs),
    totalLatencyMs: integer(s.totalLatencyMs), retryCount: integer(s.retryCount),
    finishReason: choice(s.finishReason, ['stop', 'length', 'other', 'unknown']),
    errorCategory: typeof s.errorCategory === 'string' && /^provider_http_[1-5][0-9]{2}$/.test(s.errorCategory)
      ? s.errorCategory : choice(s.errorCategory, ['provider_timeout', 'provider_http', 'provider_response_json',
        'provider_response_shape', 'provider_empty', 'provider_error', 'provider_response_invalid',
        'provider_disabled', 'provider_unavailable', 'scientific_review_failed', 'image_provider_failed', 'other_failure']),
    promptHash: matching(s.promptHash, HASH), inputContentHash: matching(s.inputContentHash, HASH),
    requestCorrelation: matching(s.requestCorrelation, UUID),
  };
}
async function readJson(response) {
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > 262_144) throw new Error('response_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function main() {
  const args = process.argv.slice(2);
  let errorsOnly = false, taskId;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--errors' && !errorsOnly) errorsOnly = true;
    else if (args[i] === '--task' && taskId === undefined && UUID.test(args[i + 1] ?? '')) taskId = args[++i];
    else throw new Error('usage_invalid');
  }
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) throw new Error('credentials_missing');
  const until = new Date();
  const from = new Date(until.getTime() - 86_400_000);
  const query = new URLSearchParams({
    fields: 'core,basic,metadata,usage', name: 'ai.gateway.call', type: 'GENERATION',
    environment: 'production-audit-metadata', limit: '10',
    fromStartTime: from.toISOString(), toStartTime: until.toISOString(),
  });
  if (errorsOnly) query.set('level', 'ERROR');
  if (taskId) {
    // Advanced filters take precedence over top-level parameters: retain the
    // time, service and operation scope in the filter as well as the task ID.
    query.set('filter', JSON.stringify([
      { type: 'datetime', column: 'startTime', operator: '>=', value: from.toISOString() },
      { type: 'datetime', column: 'startTime', operator: '<', value: until.toISOString() },
      { type: 'string', column: 'name', operator: '=', value: 'ai.gateway.call' },
      { type: 'stringOptions', column: 'type', operator: 'any of', value: ['GENERATION'] },
      { type: 'stringOptions', column: 'environment', operator: 'any of', value: ['production-audit-metadata'] },
      { type: 'stringObject', column: 'metadata', key: 'requestCorrelation', operator: '=', value: taskId },
      ...(errorsOnly ? [{ type: 'stringOptions', column: 'level', operator: 'any of', value: ['ERROR'] }] : []),
    ]));
  }
  const response = await fetch(`${origin}/api/public/v2/observations?${query}`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}` },
  });
  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: 'gateway_audit_read_unavailable', httpStatus: response.status }));
    process.exitCode = 1;
    return;
  }
  const result = await readJson(response);
  if (!Array.isArray(result.data) || result.data.length > 10) throw new Error('response_invalid');
  const observations = [];
  for (const row of result.data) {
    const safe = metadata(row?.metadata);
    if (row.name !== 'ai.gateway.call' || row.environment !== 'production-audit-metadata'
      || (taskId && safe.requestCorrelation !== taskId) || (errorsOnly && row.level !== 'ERROR')) continue;
    const traceId = safe.auditId.replaceAll('-', '');
    if (safe.auditId === unknown || row.traceId !== traceId || row.id !== traceId.slice(0, 16)
      || row.type !== 'GENERATION') continue;
    observations.push({
      ...safe,
      // Stored usage is separate from source metadata: a database default zero
      // must never be presented as a known source measurement or actual cost.
      storedUsage: { input: number(row.usageDetails?.input), output: number(row.usageDetails?.output) },
      storedCostUsd: number(row.costDetails?.total),
    });
  }
  console.log(JSON.stringify({
    event: 'gateway_audit_read', selection: errorsOnly ? 'errors' : 'all',
    ...(taskId ? { taskId } : {}),
    fromStartTime: from.toISOString(), toStartTime: until.toISOString(),
    returned: result.data.length, matched: observations.length,
    hasMore: Boolean(result.meta?.cursor), observations,
  }));
}
try { await main(); }
catch {
  console.error(JSON.stringify({ event: 'gateway_audit_read_unavailable' }));
  process.exitCode = 1;
}
