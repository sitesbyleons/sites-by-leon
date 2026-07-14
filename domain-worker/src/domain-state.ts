import type { CloudflareCustomHostname } from './cloudflare.js';

export interface AliasProviderState {
  aliasStatus: 'active' | 'dns_pending';
  cloudflareHostnameStatus: string | null;
  cloudflareSslStatus: string | null;
  lastError: string | null;
}

export function isCloudflareHostnameActive(hostname: CloudflareCustomHostname): boolean {
  return hostname.status === 'active' && hostname.ssl?.status === 'active';
}

export function deriveAliasProviderState(hostname: CloudflareCustomHostname): AliasProviderState {
  const errors = [
    ...(hostname.verification_errors ?? []),
    ...(hostname.ssl?.validation_errors ?? [])
      .map((error) => error.message)
      .filter((message): message is string => Boolean(message)),
  ];

  return {
    aliasStatus: isCloudflareHostnameActive(hostname) ? 'active' : 'dns_pending',
    cloudflareHostnameStatus: hostname.status ?? null,
    cloudflareSslStatus: hostname.ssl?.status ?? null,
    lastError: errors.length > 0 ? errors.join('; ').slice(0, 2_000) : null,
  };
}
