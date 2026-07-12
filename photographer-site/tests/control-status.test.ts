import { describe, expect, test } from 'vitest';

import { decidePublicStatus } from '../src/lib/control/status';

describe('decidePublicStatus', () => {
  test('keeps an unconfigured site active', () => {
    expect(
      decidePublicStatus({ configured: false, remoteStatus: null, lastKnownStatus: null }),
    ).toBe('active');
  });

  test('honors an explicit remote pause', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: 'paused', lastKnownStatus: 'active' }),
    ).toBe('paused');
  });

  test('fails open from the last known active state during a control outage', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: 'active' }),
    ).toBe('active');
  });

  test('keeps an explicit pause during a control outage', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: 'paused' }),
    ).toBe('paused');
  });

  test('keeps maintenance mode during a control outage', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: 'maintenance' }),
    ).toBe('maintenance');
  });

  test('accepts a verified active response after a cached pause', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: 'active', lastKnownStatus: 'paused' }),
    ).toBe('active');
  });

  test('fails open when a configured site has never received a status', () => {
    expect(
      decidePublicStatus({ configured: true, remoteStatus: null, lastKnownStatus: null }),
    ).toBe('active');
  });
});
