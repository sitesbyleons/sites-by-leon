import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

export class InvalidHostnameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHostnameError';
  }
}

/**
 * Normalize a customer hostname into the ASCII form sent to Cloudflare.
 * Wildcards, IP addresses, URLs, ports, and single-label names are rejected.
 */
export function normalizeHostname(value: string): string {
  if (typeof value !== 'string') throw new InvalidHostnameError('Hostname must be a string.');

  const trimmed = value.trim();
  if (trimmed.length === 0) throw new InvalidHostnameError('Hostname is required.');

  const withoutRootDot = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  if (
    withoutRootDot.length === 0
    || /[\s/:\\@]/u.test(withoutRootDot)
    || withoutRootDot.includes('*')
  ) {
    throw new InvalidHostnameError('Hostname must be a DNS name without a URL, port, or wildcard.');
  }

  const ascii = domainToASCII(withoutRootDot.toLowerCase());
  if (!ascii) throw new InvalidHostnameError('Hostname cannot be converted to a valid DNS name.');
  if (ascii.length > 253) throw new InvalidHostnameError('Hostname exceeds the 253-character DNS limit.');
  if (isIP(ascii) !== 0) throw new InvalidHostnameError('IP addresses are not valid custom hostnames.');

  const labels = ascii.split('.');
  if (labels.length < 2) throw new InvalidHostnameError('Hostname must contain at least two DNS labels.');

  for (const label of labels) {
    if (
      label.length === 0
      || label.length > 63
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label)
    ) {
      throw new InvalidHostnameError('Hostname contains an invalid DNS label.');
    }
  }

  if (!/[a-z]/u.test(labels.at(-1) ?? '')) {
    throw new InvalidHostnameError('Hostname must end in a non-numeric DNS label.');
  }

  return ascii;
}
