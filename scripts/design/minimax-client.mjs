const IMAGE_GENERATION_URL = 'https://api.minimax.io/v1/image_generation';
const IMAGE_MODEL = 'image-01';

class RedactedMiniMaxError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RedactedMiniMaxError';
    Object.assign(this, details);
  }
}

export function chooseAssetKey(env) {
  const key = env.MINIMAX_DESIGN_ASSET_KEY_1 || env.MINIMAX_API_KEY;
  if (!key) {
    throw new RedactedMiniMaxError('MiniMax design asset key is not configured');
  }

  return { key, keySlot: 'key1' };
}

export function getAssetKeys(env) {
  const key1 = chooseAssetKey(env).key;
  const key2 = env.MINIMAX_DESIGN_ASSET_KEY_2;
  return { key1, key2 };
}

export function isQuotaExhausted(value) {
  const statusCode = value?.base_resp?.status_code ?? value?.minimaxStatusCode;
  return statusCode === 1008;
}

function createApiError({ httpStatus, payload }) {
  const baseResp = payload?.base_resp;
  return new RedactedMiniMaxError('MiniMax image generation failed', {
    httpStatus,
    keySlot: undefined,
    minimaxStatusCode: baseResp?.status_code,
    minimaxStatusMessage: baseResp?.status_msg,
  });
}

async function parseResponse(response) {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new RedactedMiniMaxError('MiniMax image response could not be parsed', {
      httpStatus: response.status,
    });
  }
}

export function createMiniMaxImageClient({ fetch }) {
  async function generate({ aspectRatio, key, keySlot, prompt }) {
    let response;
    try {
      response = await fetch(IMAGE_GENERATION_URL, {
        body: JSON.stringify({
          aspect_ratio: aspectRatio,
          model: IMAGE_MODEL,
          prompt,
          response_format: 'url',
          n: 1,
        }),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
    } catch {
      throw new RedactedMiniMaxError('MiniMax image request failed', { keySlot });
    }

    const payload = await parseResponse(response);
    if (!response.ok || payload?.base_resp?.status_code !== 0) {
      const error = createApiError({ httpStatus: response.status, payload });
      error.keySlot = keySlot;
      throw error;
    }

    const imageUrls = payload?.data?.image_urls;
    if (!Array.isArray(imageUrls) || imageUrls.length !== 1) {
      throw new RedactedMiniMaxError('MiniMax image response did not contain one image URL', {
        httpStatus: response.status,
        keySlot,
      });
    }

    return {
      imageUrls,
      keySlot,
      model: IMAGE_MODEL,
      requestId: payload.request_id,
    };
  }

  async function generateWithFallback({ aspectRatio, key1, key2, prompt }) {
    try {
      return await generate({ aspectRatio, key: key1, keySlot: 'key1', prompt });
    } catch (error) {
      if (!key2 || error.httpStatus < 200 || error.httpStatus >= 300 || !isQuotaExhausted(error)) {
        throw error;
      }

      return generate({ aspectRatio, key: key2, keySlot: 'key2', prompt });
    }
  }

  return { generate, generateWithFallback };
}
