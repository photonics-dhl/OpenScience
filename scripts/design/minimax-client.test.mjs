import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseAssetKey,
  createMiniMaxImageClient,
  createSafeImageProvenance,
  getImageGenerationUrl,
  getAssetKeys,
  isQuotaExhausted,
} from './minimax-client.mjs';

test('chooseAssetKey selects key1 before all other configured keys', () => {
  assert.deepEqual(
    chooseAssetKey({
      MINIMAX_DESIGN_ASSET_KEY_1: 'primary-test-key',
      MINIMAX_DESIGN_ASSET_KEY_2: 'secondary-test-key',
      MINIMAX_API_KEY: 'runtime-compatibility-key',
    }),
    { key: 'primary-test-key', keySlot: 'key1' },
  );
});

test('chooseAssetKey uses the existing runtime key only as key1 compatibility', () => {
  assert.deepEqual(
    chooseAssetKey({ MINIMAX_API_KEY: 'runtime-compatibility-key' }),
    { key: 'runtime-compatibility-key', keySlot: 'key1' },
  );
});

test('chooseAssetKey honors common key1 aliases in documented precedence order', () => {
  assert.deepEqual(
    chooseAssetKey({
      MINIMAX_API_KEY: 'k0',
      MINIMAX_API_KEY1: 'k1a',
      MINIMAX_API_KEY_1: 'k1b',
      MINIMAX_DESIGN_ASSET_KEY_1: 'k1c',
    }),
    { key: 'k1c', keySlot: 'key1' },
  );
  assert.deepEqual(
    chooseAssetKey({
      MINIMAX_API_KEY: 'k0',
      MINIMAX_API_KEY1: 'k1a',
      MINIMAX_API_KEY_1: 'k1b',
    }),
    { key: 'k1b', keySlot: 'key1' },
  );
  assert.deepEqual(
    chooseAssetKey({ MINIMAX_API_KEY: 'k0', MINIMAX_API_KEY1: 'k1a' }),
    { key: 'k1a', keySlot: 'key1' },
  );
});

test('getAssetKeys honors common key2 aliases in documented precedence order', () => {
  assert.deepEqual(
    getAssetKeys({
      MINIMAX_API_KEY: 'k0',
      MINIMAX_API_KEY2: 'k2a',
      MINIMAX_API_KEY_2: 'k2b',
      MINIMAX_DESIGN_ASSET_KEY_2: 'k2c',
    }),
    { key1: 'k0', key2: 'k2c' },
  );
  assert.deepEqual(
    getAssetKeys({
      MINIMAX_API_KEY: 'k0',
      MINIMAX_API_KEY2: 'k2a',
      MINIMAX_API_KEY_2: 'k2b',
    }),
    { key1: 'k0', key2: 'k2b' },
  );
  assert.deepEqual(
    getAssetKeys({ MINIMAX_API_KEY: 'k0', MINIMAX_API_KEY2: 'k2a' }),
    { key1: 'k0', key2: 'k2a' },
  );
});

test('chooseAssetKey reports missing credentials without environment values', () => {
  assert.throws(
    () => chooseAssetKey({}),
    (error) =>
      error.message === 'MiniMax design asset key is not configured' &&
      !error.message.includes('MINIMAX_'),
  );
});

test('isQuotaExhausted accepts only the MiniMax insufficient-balance status', () => {
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 1008 } }), true);
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 1002 } }), false);
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 1004 } }), false);
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 1026 } }), false);
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 2013 } }), false);
  assert.equal(isQuotaExhausted({ base_resp: { status_code: 2049 } }), false);
  assert.equal(isQuotaExhausted(new Error('network unavailable')), false);
});

test('getImageGenerationUrl maps the approved MiniMax regions', () => {
  assert.equal(getImageGenerationUrl('cn'), 'https://api.minimaxi.com/v1/image_generation');
  assert.equal(getImageGenerationUrl('global'), 'https://api.minimax.io/v1/image_generation');
  assert.throws(() => getImageGenerationUrl('moon'), /Invalid MiniMax region/);
});

test('safe provenance excludes remote image URLs and URL query parameters', () => {
  const provenance = createSafeImageProvenance({
    generatedAt: '2026-08-08T00:00:00.000Z',
    host: 'api.minimaxi.com',
    imageUrl: 'https://image.example.test/asset.png?transient=query-value',
    intendedSurface: 'cross-surface Figma visual master',
    keySlot: 'key2',
    localAssetPath: 'docs/design-assets/generated/observatory.png',
    model: 'image-01',
    postProcessing: 'none',
    prompt: 'scholarly evidence field',
    region: 'cn',
    requestId: 'request-789',
  });

  assert.deepEqual(provenance, {
    generatedAt: '2026-08-08T00:00:00.000Z',
    host: 'api.minimaxi.com',
    intendedSurface: 'cross-surface Figma visual master',
    keySlot: 'key2',
    localAssetPath: 'docs/design-assets/generated/observatory.png',
    model: 'image-01',
    postProcessing: 'none',
    prompt: 'scholarly evidence field',
    region: 'cn',
    requestId: 'request-789',
  });
  assert.doesNotMatch(JSON.stringify(provenance), /imageUrl|\?/);
});

test('safe provenance records an unavailable request ID as null', () => {
  const provenance = createSafeImageProvenance({
    generatedAt: '2026-08-08T00:00:00.000Z',
    host: 'api.minimaxi.com',
    intendedSurface: 'cross-surface Figma visual master',
    keySlot: 'key1',
    localAssetPath: 'docs/design-assets/generated/observatory.png',
    model: 'image-01',
    postProcessing: 'none',
    prompt: 'scholarly evidence field',
    region: 'cn',
  });

  assert.equal(JSON.parse(JSON.stringify(provenance)).requestId, null);
});

test('image client sends the constrained image request and returns redacted success data', async () => {
  const calls = [];
  const client = createMiniMaxImageClient({
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0 },
          request_id: 'request-123',
          data: { image_urls: ['https://example.test/generated.png'] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const result = await client.generate({
    aspectRatio: '16:9',
    key: 'primary-test-key',
    keySlot: 'key1',
    prompt: 'scholarly material evidence trajectory',
  });

  assert.deepEqual(result, {
    imageUrls: ['https://example.test/generated.png'],
    keySlot: 'key1',
    model: 'image-01',
    requestId: 'request-123',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.minimax.io/v1/image_generation');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    aspect_ratio: '16:9',
    model: 'image-01',
    prompt: 'scholarly material evidence trajectory',
    response_format: 'url',
    n: 1,
  });
});

test('image client uses the caller-selected image-generation URL', async () => {
  const calls = [];
  const client = createMiniMaxImageClient({
    fetch: async (url) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0 },
          request_id: 'request-cn',
          data: { image_urls: ['https://example.test/generated.png'] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    imageGenerationUrl: getImageGenerationUrl('cn'),
  });

  await client.generate({
    aspectRatio: '16:9',
    key: 'k1',
    keySlot: 'key1',
    prompt: 'scholarly material evidence trajectory',
  });

  assert.deepEqual(calls, ['https://api.minimaxi.com/v1/image_generation']);
});

test('image client switches from key1 to key2 only for MiniMax status 1008', async () => {
  const authorizationHeaders = [];
  const client = createMiniMaxImageClient({
    fetch: async (_url, options) => {
      authorizationHeaders.push(options.headers.Authorization);
      if (authorizationHeaders.length === 1) {
        return new Response(
          JSON.stringify({ base_resp: { status_code: 1008, status_msg: 'balance exhausted' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          base_resp: { status_code: 0 },
          request_id: 'request-456',
          data: { image_urls: ['https://example.test/fallback.png'] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const result = await client.generateWithFallback({
    aspectRatio: '4:3',
    key1: 'primary-test-key',
    key2: 'secondary-test-key',
    prompt: 'editorial evidence field',
  });

  assert.equal(result.keySlot, 'key2');
  assert.deepEqual(authorizationHeaders, [
    'Bearer primary-test-key',
    'Bearer secondary-test-key',
  ]);
});

test('image client does not switch keys for non-quota API errors and redacts the error', async () => {
  let calls = 0;
  const client = createMiniMaxImageClient({
    fetch: async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ base_resp: { status_code: 1002, status_msg: 'rate limited' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  await assert.rejects(
    client.generateWithFallback({
      aspectRatio: '4:3',
      key1: 'primary-test-key',
      key2: 'secondary-test-key',
      prompt: 'editorial evidence field',
    }),
    (error) =>
      error.keySlot === 'key1' &&
      error.minimaxStatusCode === 1002 &&
      error.minimaxStatusMessage === 'rate limited' &&
      !JSON.stringify(error).includes('primary-test-key') &&
      !JSON.stringify(error).includes('secondary-test-key'),
  );
  assert.equal(calls, 1);
});
