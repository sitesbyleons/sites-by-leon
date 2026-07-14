import { CloudflareApiError } from './cloudflare.js';
import { InvalidHostnameError } from './hostname.js';

export class PermanentJobError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PermanentJobError';
  }
}

export function calculateBackoffMs(
  attemptCount: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError('attemptCount must be a positive integer.');
  }
  if (!Number.isSafeInteger(baseDelayMs) || baseDelayMs < 1) {
    throw new RangeError('baseDelayMs must be a positive integer.');
  }
  if (!Number.isSafeInteger(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new RangeError('maxDelayMs must be an integer greater than or equal to baseDelayMs.');
  }

  const exponent = Math.min(attemptCount - 1, 30);
  return Math.min(maxDelayMs, baseDelayMs * (2 ** exponent));
}

export function isRetryableFailure(error: unknown): boolean {
  if (error instanceof InvalidHostnameError || error instanceof PermanentJobError) return false;
  if (error instanceof CloudflareApiError) return error.retryable;
  return true;
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown domain job failure.';
  return message.slice(0, 2_000);
}
