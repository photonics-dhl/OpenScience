-- Administrative one-time provisioning, never run by the connector.
-- Execute inside the existing production PostgreSQL container with its injected
-- administrator identity. No application migration, table alteration or DML.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Deliberately fail if these objects already exist: do not alter an unknown role.
CREATE ROLE xgs_gateway_telemetry NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1;
ALTER ROLE xgs_gateway_telemetry SET default_transaction_read_only = on;
ALTER ROLE xgs_gateway_telemetry SET statement_timeout = '3s';
ALTER ROLE xgs_gateway_telemetry SET lock_timeout = '500ms';
ALTER ROLE xgs_gateway_telemetry SET idle_in_transaction_session_timeout = '5s';
ALTER ROLE xgs_gateway_telemetry SET search_path = pg_catalog, xgs_telemetry;
CREATE SCHEMA xgs_telemetry;
REVOKE ALL ON SCHEMA xgs_telemetry FROM PUBLIC;

CREATE VIEW xgs_telemetry.gateway_calls WITH (security_barrier = true) AS
SELECT id, created_at,
  jsonb_build_object(
    'operation', CASE WHEN metadata->>'operation' IN ('text','ocr','image','scientific_review') THEN metadata->>'operation' END,
    'provider', CASE WHEN metadata->>'provider' ~ '^[A-Za-z][A-Za-z0-9_.-]{0,79}$' THEN metadata->>'provider' END,
    'model', CASE WHEN metadata->>'model' ~ '^[A-Za-z][A-Za-z0-9_.-]{0,127}$'
      OR metadata->>'model' IN ('chatgpt-web/6-pro', 'chatgpt-web/6-pro-image-generation-tool') THEN metadata->>'model' END,
    'outcome', CASE WHEN metadata->>'outcome' IN ('succeeded','failed') THEN metadata->>'outcome' END,
    'inputTokens', CASE WHEN jsonb_typeof(metadata->'inputTokens') = 'number' THEN metadata->'inputTokens' END,
    'outputTokens', CASE WHEN jsonb_typeof(metadata->'outputTokens') = 'number' THEN metadata->'outputTokens' END,
    'estimatedInputTokens', CASE WHEN jsonb_typeof(metadata->'estimatedInputTokens') = 'number' THEN metadata->'estimatedInputTokens' END,
    'estimatedOutputTokens', CASE WHEN jsonb_typeof(metadata->'estimatedOutputTokens') = 'number' THEN metadata->'estimatedOutputTokens' END,
    'estimatedCostUsdMicros', CASE WHEN jsonb_typeof(metadata->'estimatedCostUsdMicros') = 'number' THEN metadata->'estimatedCostUsdMicros' END,
    'actualCostUsdMicros', CASE WHEN jsonb_typeof(metadata->'actualCostUsdMicros') = 'number' THEN metadata->'actualCostUsdMicros' END,
    'currency', CASE WHEN metadata->>'currency' = 'USD' THEN 'USD' END,
    'latencyMs', CASE WHEN jsonb_typeof(metadata->'latencyMs') = 'number' THEN metadata->'latencyMs' END,
    'totalLatencyMs', CASE WHEN jsonb_typeof(metadata->'totalLatencyMs') = 'number' THEN metadata->'totalLatencyMs' END,
    'retryCount', CASE WHEN jsonb_typeof(metadata->'retryCount') = 'number' THEN metadata->'retryCount' END,
    'finishReason', CASE WHEN metadata->>'finishReason' IN ('stop','length','other','unknown') THEN metadata->>'finishReason' END,
    'errorCategory', CASE
      WHEN metadata->>'error' IN ('provider_timeout','provider_http','provider_response_json','provider_response_shape',
        'provider_empty','provider_error','provider_response_invalid','provider_disabled','provider_unavailable',
        'scientific_review_failed','image_provider_failed') THEN metadata->>'error'
      WHEN metadata->>'error' ~ '^provider_http_[1-5][0-9]{2}$' THEN metadata->>'error'
      WHEN metadata->>'outcome' = 'failed' THEN 'other_failure'
      END,
    'promptHash', CASE WHEN metadata->>'promptHash' ~ '^[a-f0-9]{64}$' THEN metadata->>'promptHash' END,
    'inputContentHash', CASE WHEN metadata->>'inputContentHash' ~ '^[a-f0-9]{64}$' THEN metadata->>'inputContentHash' END,
    'requestCorrelation', CASE WHEN request_id ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN lower(request_id) END
  ) AS safe_metadata
FROM public.audit_logs
WHERE action = 'ai.gateway.call';

REVOKE ALL ON xgs_telemetry.gateway_calls FROM PUBLIC;
GRANT USAGE ON SCHEMA xgs_telemetry TO xgs_gateway_telemetry;
GRANT SELECT ON xgs_telemetry.gateway_calls TO xgs_gateway_telemetry;
-- The newly created role has no membership or grants on application tables.
-- LOGIN/password and a CONNECT grant for the current database are provisioned
-- separately from server-generated secrets, with output suppressed.
COMMIT;
