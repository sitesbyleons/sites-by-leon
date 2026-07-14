import { describe, expect, it } from 'vitest';

import { CloudflareApiError } from '../src/cloudflare.js';
import { InvalidHostnameError } from '../src/hostname.js';
import { calculateBackoffMs, isRetryableFailure, PermanentJobError } from '../src/retry.js';

describe('retry helpers', () => {
  it('calculates capped exponential backoff from the current attempt', () => {
    expect(calculateBackoffMs(1, 5_000, 60_000)).toBe(5_000);
    expect(calculateBackoffMs(2, 5_000, 60_000)).toBe(10_000);
    expect(calculateBackoffMs(5, 5_000, 60_000)).toBe(60_000);
  });

  it('classifies Cloudflare and local failures', () => {
    expect(isRetryableFailure(new CloudflareApiError('rate limited', 429))).toBe(true);
    expect(isRetryableFailure(new CloudflareApiError('conflict', 409))).toBe(true);
    expect(isRetryableFailure(new CloudflareApiError('unauthorized', 401))).toBe(false);
    expect(isRetryableFailure(new InvalidHostnameError('bad hostname'))).toBe(false);
    expect(isRetryableFailure(new PermanentJobError('missing record'))).toBe(false);
    expect(isRetryableFailure(new Error('temporary network error'))).toBe(true);
  });
});
