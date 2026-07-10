import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { readClerkIdentity } from '../_shared/billing-core.ts';
import {
  allowedDashboardRequest,
  bearerToken,
  corsHeaders,
  dashboardOrigin,
  json,
} from '../_shared/http.ts';
import { createStripe } from '../_shared/stripe-client.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return allowedDashboardRequest(request)
      ? new Response(null, { status: 204, headers: corsHeaders(origin) })
      : json(origin, { message: 'Origin not allowed.' }, 403);
  }

  if (request.method !== 'POST') return json(origin, { message: 'Method not allowed.' }, 405);
  if (!allowedDashboardRequest(request)) return json(origin, { message: 'Origin not allowed.' }, 403);

  const identity = readClerkIdentity(bearerToken(request));
  if (!identity) return json(origin, { message: 'A Clerk organization session is required.' }, 401);

  const stripe = createStripe();
  const supabase = createSupabaseAdmin();
  if (!stripe || !supabase || !dashboardOrigin()) {
    return json(origin, { message: 'Billing management is not configured yet.' }, 503);
  }

  const { data: workspace, error } = await supabase
    .from('client_workspaces')
    .select('stripe_customer_id')
    .eq('clerk_org_id', identity.orgId)
    .maybeSingle();

  if (error || !workspace?.stripe_customer_id) {
    return json(origin, { message: 'No Stripe billing customer is connected to this workspace.' }, 404);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripe_customer_id,
    return_url: `${dashboardOrigin()}/dashboard`,
  });

  return json(origin, { url: session.url });
});
