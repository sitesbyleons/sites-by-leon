import type { APIRoute } from 'astro';

import { getPlan } from '../../../lib/billing';
import { isTrustedOrigin } from '../../../lib/request-security';

export const POST: APIRoute = async ({ request, locals, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }

  const auth = locals.auth();
  if (!auth.userId) return auth.redirectToSignIn({ returnBackUrl: '/dashboard' });

  const form = await request.formData();
  const plan = getPlan(String(form.get('plan') ?? ''));
  if (!plan) return Response.json({ message: 'Choose a valid monthly plan.' }, { status: 400 });

  const functionUrl = import.meta.env.PUBLIC_CHECKOUT_FUNCTION_URL;
  if (!functionUrl) {
    return Response.json({ message: 'Checkout is not open yet. Contact Leon to reserve this plan.' }, { status: 503 });
  }

  const token = await auth.getToken();
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: url.origin,
    },
    body: JSON.stringify({ plan: plan.key, returnOrigin: url.origin }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || typeof payload?.url !== 'string') {
    return Response.json({ message: 'Checkout could not start. Contact Leon and nothing will be charged.' }, { status: 502 });
  }

  return Response.redirect(payload.url, 303);
};

