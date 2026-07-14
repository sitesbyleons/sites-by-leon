import { describe, expect, it } from 'vitest';

import { InvalidHostnameError, normalizeHostname } from '../src/hostname.js';

describe('normalizeHostname', () => {
  it('normalizes case, whitespace, a root dot, and international labels', () => {
    expect(normalizeHostname('  BÜCHER.Example. ')).toBe('xn--bcher-kva.example');
  });

  it.each([
    '',
    'localhost',
    'https://example.com',
    'example.com:443',
    '*.example.com',
    '127.0.0.1',
    '123.456',
    'bad_label.example',
    '-bad.example',
    'bad-.example',
    'two..dots.example',
  ])('rejects invalid input %j', (hostname) => {
    expect(() => normalizeHostname(hostname)).toThrow(InvalidHostnameError);
  });

  it('rejects labels and hostnames beyond DNS limits', () => {
    expect(() => normalizeHostname(`${'a'.repeat(64)}.example`)).toThrow('invalid DNS label');
    const tooLong = Array.from({ length: 5 }, () => 'a'.repeat(63)).join('.');
    expect(() => normalizeHostname(tooLong)).toThrow('253-character');
  });
});
