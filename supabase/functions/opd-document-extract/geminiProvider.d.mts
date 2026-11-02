export interface GeminiAttempt {
  model: string;
  attempt: number;
  status?: number;
  timedOut: boolean;
  phase: 'model-check' | 'generate';
}

export type GeminiProviderResult =
  | {
    ok: true;
    response: Response;
    responseBody: string;
    model: string;
    attempt: number;
    fallbackFor?: string;
  }
  | {
    ok: false;
    status: number;
    model: string;
    attempt: number;
    timedOut: boolean;
    code: string;
    reason: string;
    fallbackFor?: string;
  };

export const GEMINI_WORKFLOW_TIMEOUT_MS: number;

export function generateContentWithFallback(options: {
  apiKey: string;
  primaryModel: string;
  fallbackModel: string;
  requestBody: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (delay: number) => Promise<void>;
  onAttempt?: (attempt: GeminiAttempt) => void;
  requestTimeoutMs?: number;
  workflowTimeoutMs?: number;
  fallbackReserveMs?: number;
}): Promise<GeminiProviderResult>;
