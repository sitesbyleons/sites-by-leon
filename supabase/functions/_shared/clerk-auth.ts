import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.3';

export type ClerkIdentity = {
  userId: string;
  orgId: string | null;
};

let cachedUrl = '';
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyClerkIdentity(token: string): Promise<ClerkIdentity | null> {
  const jwksUrl = Deno.env.get('CLERK_JWKS_URL')?.trim() ?? '';
  const issuer = Deno.env.get('CLERK_ISSUER')?.trim() ?? '';
  if (!token || !jwksUrl || !issuer) return null;

  try {
    if (!cachedJwks || cachedUrl !== jwksUrl) {
      cachedUrl = jwksUrl;
      cachedJwks = createRemoteJWKSet(new URL(jwksUrl));
    }
    const { payload } = await jwtVerify(token, cachedJwks, {
      issuer,
      algorithms: ['RS256'],
    });
    const compactOrg =
      payload.o && typeof payload.o === 'object'
        ? (payload.o as Record<string, unknown>).id
        : null;
    const orgId =
      typeof payload.org_id === 'string'
        ? payload.org_id
        : typeof compactOrg === 'string'
          ? compactOrg
          : null;
    return typeof payload.sub === 'string' ? { userId: payload.sub, orgId } : null;
  } catch {
    return null;
  }
}
