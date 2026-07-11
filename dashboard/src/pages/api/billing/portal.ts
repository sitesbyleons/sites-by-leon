import type { APIRoute } from 'astro';

import { isTrustedOrigin } from '../../../lib/request-security';

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }

  const auth = locals.auth();
  if (!auth.userId) return auth.redirectToSignIn({ returnBackUrl: '/dashboard' });

  const functionUrl = import.meta.env.PUBLIC_PORTAL_FUNCTION_URL;
  if (!functionUrl) {
    return Response.json({ message: 'Billing management is not connected yet. Contact Leon for help.' }, { status: 503 });
  }

  const token = await auth.getToken();
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: url.origin,
    },
    body: JSON.stringify({ returnOrigin: url.origin }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || typeof payload?.url !== 'string') {
    return Response.json({ message: 'Billing could not open. Contact Leon and your plan will not change.' }, { status: 502 });
  }

  return Response.redirect(payload.url, 303);
};
