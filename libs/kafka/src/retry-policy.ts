import { IHeaders } from 'kafkajs';

/** How often and how fast a failed message is retried before it goes to the DLQ. */
export interface RetryPolicy {
  /** Total tries including the first delivery (4 = 1 + 3 retries). */
  readonly maxAttempts: number;
  /** Cap of the first retry's delay; doubles per attempt. */
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

export const retryTopicOf = (topic: string): string => `${topic}.retry`;
export const dlqTopicOf = (topic: string): string => `${topic}.dlq`;

/** Headers added to retried and dead-lettered messages (the originals are kept too). */
export const FAILURE_HEADERS = {
  attempt: 'x-retry-attempt',
  notBefore: 'x-retry-not-before',
  originalTopic: 'x-original-topic',
  originalPartition: 'x-original-partition',
  originalOffset: 'x-original-offset',
  errorType: 'x-error-type',
  errorMessage: 'x-error-message',
  failedAt: 'x-failed-at',
} as const;

/**
 * Exponential backoff with full jitter: a random delay between 0 and base * 2^(attempt-1),
 * capped. Jitter spreads retries out, so many consumers that failed together (e.g. the DB
 * was down) do not all hit the recovering dependency at the same moment.
 */
export function backoffDelay(
  failedAttempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  return Math.round(random() * cap);
}

export type FailureRoute =
  | { readonly to: 'retry'; readonly nextAttempt: number; readonly delayMs: number }
  | { readonly to: 'dlq'; readonly reason: 'permanent' | 'exhausted' };

/** Where a message goes after `failedAttempt` (1 = first delivery) threw `error`. */
export function routeFailure(
  failedAttempt: number,
  permanent: boolean,
  policy: RetryPolicy,
  random?: () => number,
): FailureRoute {
  if (permanent) return { to: 'dlq', reason: 'permanent' };
  if (failedAttempt >= policy.maxAttempts) return { to: 'dlq', reason: 'exhausted' };
  return {
    to: 'retry',
    nextAttempt: failedAttempt + 1,
    delayMs: backoffDelay(failedAttempt, policy, random),
  };
}

/** Reads a numeric header written by this module; `fallback` when absent or invalid. */
export function numberHeader(headers: IHeaders, name: string, fallback: number): number {
  const raw = headers[name];
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : '';
  const value = Number(text);
  return text !== '' && Number.isFinite(value) ? value : fallback;
}

/** Error details for headers: type and a one-line, bounded message (not a log sink). */
export function describeError(error: unknown): { type: string; message: string } {
  const type = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  return { type, message: message.replace(/\s+/g, ' ').trim().slice(0, 500) };
}
