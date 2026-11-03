import assert from 'node:assert/strict';
import test from 'node:test';
import { generateContentWithFallback } from './geminiProvider.mjs';

function response(status, body = {}) {
  return new Response(JSON.stringify(body), { status });
}

function options(fetchImpl) {
  const attempts = [];
  return {
    attempts,
    values: {
      apiKey: 'server-key',
      primaryModel: 'primary-model',
      fallbackModel: 'fallback-model',
      requestBody: { contents: [] },
      fetchImpl,
      random: () => 0.5,
      sleep: async () => {},
      onAttempt: (attempt) => attempts.push(attempt),
    },
  };
}

test('retries Gemini 503 and then returns a successful extraction', async () => {
  let requests = 0;
  const testOptions = options(async () => {
    requests += 1;
    return requests < 3
      ? response(503, { error: { status: 'UNAVAILABLE' } })
      : response(200, { candidates: [] });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, true);
  assert.equal(result.attempt, 3);
  assert.equal(result.model, 'primary-model');
  assert.equal(requests, 3);
  assert.equal(testOptions.attempts.filter(({ phase }) => phase === 'generate').length, 3);
});

test('retries temporary network failures', async () => {
  let requests = 0;
  const testOptions = options(async () => {
    requests += 1;
    if (requests === 1) throw new TypeError('fetch failed');
    return response(200, { candidates: [] });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, true);
  assert.equal(result.attempt, 2);
  assert.equal(requests, 2);
});

test('retries Gemini 429 then checks and uses the compatible fallback model', async () => {
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const testOptions = options(async (url) => {
    if (url.endsWith('/models/fallback-model')) {
      return response(200, { supportedGenerationMethods: ['generateContent'] });
    }
    if (url.includes('/models/primary-model:')) {
      primaryRequests += 1;
      return response(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    }
    fallbackRequests += 1;
    return response(200, { candidates: [] });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, true);
  assert.equal(result.model, 'fallback-model');
  assert.equal(result.fallbackFor, 'primary-model');
  assert.equal(primaryRequests, 3);
  assert.equal(fallbackRequests, 1);
});

test('uses the fallback when the primary model is not found', async () => {
  const fallbackModel = 'gemini-3.5-flash-lite';
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const testOptions = options(async (url) => {
    if (url.endsWith(`/models/${fallbackModel}`)) {
      return response(200, { supportedGenerationMethods: ['generateContent'] });
    }
    if (url.includes('/models/primary-model:')) {
      primaryRequests += 1;
      return response(404, { error: { status: 'NOT_FOUND' } });
    }
    fallbackRequests += 1;
    return response(200, { candidates: [] });
  });
  testOptions.values.fallbackModel = fallbackModel;

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, true);
  assert.equal(result.model, fallbackModel);
  assert.equal(result.fallbackFor, 'primary-model');
  assert.equal(primaryRequests, 1);
  assert.equal(fallbackRequests, 1);
});

test('returns a model-not-found error when the fallback is unavailable', async () => {
  let primaryRequests = 0;
  let fallbackGenerationRequests = 0;
  const testOptions = options(async (url) => {
    if (url.endsWith('/models/fallback-model')) {
      return response(404, { error: { status: 'NOT_FOUND' } });
    }
    if (url.includes('/models/primary-model:')) {
      primaryRequests += 1;
      return response(404, { error: { status: 'NOT_FOUND' } });
    }
    fallbackGenerationRequests += 1;
    return response(200, { candidates: [] });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.code, 'NOT_FOUND');
  assert.equal(result.reason, 'model-check');
  assert.equal(result.fallbackFor, 'primary-model');
  assert.equal(primaryRequests, 1);
  assert.equal(fallbackGenerationRequests, 0);
});

test('retries request timeouts and can fall back to a supported model', async () => {
  let primaryRequests = 0;
  let fallbackRequests = 0;
  const testOptions = options(async (url, { signal }) => {
    if (url.endsWith('/models/fallback-model')) {
      return response(200, { supportedGenerationMethods: ['generateContent'] });
    }
    if (url.includes('/models/primary-model:')) {
      primaryRequests += 1;
      return new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true },
        );
      });
    }
    fallbackRequests += 1;
    return response(200, { candidates: [] });
  });
  testOptions.values.requestTimeoutMs = 1;

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(primaryRequests, 3);
  assert.equal(fallbackRequests, 1);
  assert.equal(result.ok, true);
  assert.equal(result.model, 'fallback-model');
});

test('does not retry or fall back for an invalid provider request', async () => {
  let requests = 0;
  const testOptions = options(async () => {
    requests += 1;
    return response(400, { error: { status: 'INVALID_ARGUMENT' } });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(requests, 1);
  assert.equal(testOptions.attempts.length, 1);
});

test('does not retry or fall back for provider authentication failures', async () => {
  let requests = 0;
  const testOptions = options(async () => {
    requests += 1;
    return response(403, { error: { status: 'PERMISSION_DENIED' } });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(requests, 1);
});

test('does not use a fallback model that lacks generateContent support', async () => {
  let generationRequests = 0;
  const testOptions = options(async (url) => {
    if (url.endsWith('/models/fallback-model')) {
      return response(200, { supportedGenerationMethods: ['embedContent'] });
    }
    generationRequests += 1;
    return response(404, { error: { status: 'NOT_FOUND' } });
  });

  const result = await generateContentWithFallback(testOptions.values);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unsupported-generation-method');
  assert.equal(result.status, 422);
  assert.equal(generationRequests, 1);
});
