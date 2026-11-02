const MAX_ATTEMPTS = 3;
export const GEMINI_WORKFLOW_TIMEOUT_MS = 135_000;
const MAX_REQUEST_TIMEOUT_MS = 50_000;
const FALLBACK_RESERVE_MS = 15_000;
const MODEL_LOOKUP_TIMEOUT_MS = 8_000;

function providerCode(body) {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.error?.status === 'string' ? parsed.error.status : '';
  } catch {
    return '';
  }
}

function isRetryableStatus(status) {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

function isRetryableCode(code) {
  return code === 'RESOURCE_EXHAUSTED'
    || code === 'UNAVAILABLE'
    || code === 'DEADLINE_EXCEEDED'
    || code === 'INTERNAL';
}

function isRetryableFailure(status, code) {
  return isRetryableStatus(status) || isRetryableCode(code);
}

function isModelUnavailable(status, code) {
  return status === 404 || code === 'NOT_FOUND';
}

function isAuthenticationFailure(status, code) {
  return status === 401
    || status === 403
    || code === 'API_KEY_INVALID'
    || code === 'PERMISSION_DENIED';
}

function backoffDelay(attempt, random) {
  const baseDelay = 500 * (2 ** (attempt - 1));
  return Math.round(baseDelay * (0.5 + random()));
}

function failureResult({
  status,
  model,
  attempt,
  timedOut = false,
  code = '',
  reason = '',
}) {
  return { ok: false, status, model, attempt, timedOut, code, reason };
}

async function requestModelMetadata(model, apiKey, options) {
  const { fetchImpl, now, deadline, onAttempt } = options;
  const timeoutMs = Math.min(MODEL_LOOKUP_TIMEOUT_MS, deadline - now());
  if (timeoutMs <= 0) {
    return failureResult({ status: 504, model, attempt: 1, timedOut: true, reason: 'deadline' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`,
      {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey },
        signal: controller.signal,
      },
    );
    const body = await response.text();
    const code = providerCode(body);
    onAttempt({ model, attempt: 1, status: response.status, timedOut: false, phase: 'model-check' });
    if (!response.ok) {
      return failureResult({
        status: response.status,
        model,
        attempt: 1,
        code,
        reason: 'model-check',
      });
    }

    let metadata;
    try {
      metadata = JSON.parse(body);
    } catch {
      return failureResult({ status: 502, model, attempt: 1, reason: 'invalid-model-metadata' });
    }
    if (!metadata?.supportedGenerationMethods?.includes('generateContent')) {
      return failureResult({ status: 422, model, attempt: 1, reason: 'unsupported-generation-method' });
    }
    return { ok: true };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    onAttempt({ model, attempt: 1, timedOut, phase: 'model-check' });
    return failureResult({
      status: timedOut ? 504 : 502,
      model,
      attempt: 1,
      timedOut,
      reason: 'model-check-network',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function requestModel(model, requestBody, apiKey, options) {
  const {
    fetchImpl,
    now,
    deadline,
    random,
    sleep,
    onAttempt,
    preserveFallbackTime,
    requestTimeoutMs,
    fallbackReserveMs,
  } = options;
  let lastFailure = failureResult({ status: 502, model, attempt: 0 });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const reserve = preserveFallbackTime ? fallbackReserveMs : 0;
    const timeoutMs = Math.min(requestTimeoutMs, deadline - now() - reserve);
    if (timeoutMs <= 0) {
      return lastFailure.status === 504
        ? lastFailure
        : failureResult({
          status: 504,
          model,
          attempt: attempt - 1,
          timedOut: true,
          reason: 'workflow-deadline',
        });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        },
      );
      const body = await response.text();
      const code = providerCode(body);
      onAttempt({ model, attempt, status: response.status, timedOut: false, phase: 'generate' });
      if (response.ok) return { ok: true, response, responseBody: body, model, attempt };

      lastFailure = failureResult({
        status: response.status,
        model,
        attempt,
        code,
        reason: 'provider-response',
      });
      if (isAuthenticationFailure(response.status, code)
        || (!isRetryableFailure(response.status, code) && !isModelUnavailable(response.status, code))) {
        return lastFailure;
      }
      if (isModelUnavailable(response.status, code)) return lastFailure;
    } catch (error) {
      const timedOut = controller.signal.aborted;
      onAttempt({
        model,
        attempt,
        timedOut,
        phase: 'generate',
      });
      lastFailure = failureResult({
        status: timedOut ? 504 : 502,
        model,
        attempt,
        timedOut,
        reason: timedOut ? 'provider-timeout' : 'provider-network',
      });
    } finally {
      clearTimeout(timer);
    }

    if (attempt < MAX_ATTEMPTS) {
      const delay = backoffDelay(attempt, random);
      const reserve = preserveFallbackTime ? fallbackReserveMs : 0;
      if (now() + delay >= deadline - reserve) break;
      await sleep(delay);
    }
  }

  return lastFailure;
}

export async function generateContentWithFallback({
  apiKey,
  primaryModel,
  fallbackModel,
  requestBody,
  fetchImpl = fetch,
  now = Date.now,
  random = Math.random,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  onAttempt = () => {},
  requestTimeoutMs = MAX_REQUEST_TIMEOUT_MS,
  workflowTimeoutMs = GEMINI_WORKFLOW_TIMEOUT_MS,
  fallbackReserveMs = FALLBACK_RESERVE_MS,
}) {
  const deadline = now() + workflowTimeoutMs;
  const options = {
    fetchImpl,
    now,
    deadline,
    random,
    sleep,
    onAttempt,
    requestTimeoutMs,
    fallbackReserveMs,
  };
  const primary = await requestModel(primaryModel, requestBody, apiKey, {
    ...options,
    preserveFallbackTime: true,
  });
  if (primary.ok
    || isAuthenticationFailure(primary.status, primary.code)
    || (!isRetryableFailure(primary.status, primary.code)
      && !isModelUnavailable(primary.status, primary.code))) {
    return primary;
  }
  if (!fallbackModel || fallbackModel === primaryModel) return primary;

  const fallbackAvailability = await requestModelMetadata(fallbackModel, apiKey, options);
  if (!fallbackAvailability.ok) {
    return {
      ...fallbackAvailability,
      fallbackFor: primaryModel,
    };
  }

  const fallback = await requestModel(fallbackModel, requestBody, apiKey, {
    ...options,
    preserveFallbackTime: false,
  });
  return fallback.ok ? { ...fallback, fallbackFor: primaryModel } : fallback;
}
