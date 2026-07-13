export function resolveTrustedOrigin(origin: string | null, internalOrigin: string) {
  if (!origin) return null;
  try {
    const supplied = new URL(origin);
    const internal = new URL(internalOrigin);
    if (supplied.host !== internal.host) return null;
    if (supplied.protocol === internal.protocol) return supplied.origin;
    // The Node services receive HTTP from the private Caddy network while the
    // browser correctly sees HTTPS through Cloudflare Tunnel.
    if (supplied.protocol === 'https:' && internal.protocol === 'http:') return supplied.origin;
    return null;
  } catch {
    return null;
  }
}

export function isTrustedOrigin(origin: string | null, internalOrigin: string) {
  return resolveTrustedOrigin(origin, internalOrigin) !== null;
}
