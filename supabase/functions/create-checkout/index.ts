import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { checkoutAllowed, readClerkIdentity, resolvePlan } from '../_shared/billing-core.ts';
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

  // The Supabase gateway must deploy this function with verify_jwt=true. After
  // gateway verification, the Clerk session claims are safe to use for lookup.
  const identity = readClerkIdentity(bearerToken(request));
  if (!identity) return json(origin, { message: 'Sign in to manage a subscription.' }, 401);

  const input = await request.json().catch(() => null);
  const plan = resolvePlan(input?.plan, (name) => Deno.env.get(name));
  if (!plan) return json(origin, { message: 'That monthly plan is not configured.' }, 400);

  const stripe = createStripe();
  const supabase = createSupabaseAdmin();
  if (!stripe || !supabase || !dashboardOrigin()) {
    return json(origin, { message: 'Checkout is not configured yet.' }, 503);
  }

  let workspaceId: string | null = null;
  if (identity.orgId) {
    const organizationWorkspace = await supabase
      .from('client_workspaces')
      .select('id')
      .eq('clerk_org_id', identity.orgId)
      .maybeSingle();
    workspaceId = organizationWorkspace.data?.id ?? null;
  }
  if (!workspaceId) {
    const membership = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('clerk_user_id', identity.userId)
      .limit(1)
      .maybeSingle();
    workspaceId = membership.data?.workspace_id ?? null;
  }

  const { data: workspace, error: workspaceError } = workspaceId
    ? await supabase
        .from('client_workspaces')
        .select('id,name,status,stripe_customer_id')
        .eq('id', workspaceId)
        .maybeSingle()
    : { data: null, error: null };

  if (workspaceError || !workspace) {
    return json(origin, { message: 'This client workspace is not ready for Checkout.' }, 404);
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('workspace_id', workspace.id)
    .maybeSingle();

  if (subscriptionError) return json(origin, { message: 'Billing status could not be verified.' }, 503);
  if (!checkoutAllowed(workspace.status, subscription?.status ?? null)) {
    return json(origin, { message: 'This workspace is not eligible to start another subscription.' }, 409);
  }

  let customerId = workspace.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: workspace.name,
      metadata: {
        workspace_id: workspace.id,
        clerk_user_id: identity.userId,
        ...(identity.orgId ? { clerk_org_id: identity.orgId } : {}),
      },
    });
    customerId = customer.id;

    const { error: updateError } = await supabase
      .from('client_workspaces')
      .update({ stripe_customer_id: customerId })
      .eq('id', workspace.id);
    if (updateError) return json(origin, { message: 'The billing customer could not be saved.' }, 503);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: workspace.id,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    billing_address_collection: 'auto',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${dashboardOrigin()}/dashboard?checkout=success`,
    cancel_url: `${dashboardOrigin()}/dashboard?checkout=cancelled`,
    metadata: {
      workspace_id: workspace.id,
      plan_key: plan.key,
      ...(identity.orgId ? { clerk_org_id: identity.orgId } : {}),
    },
    subscription_data: {
      metadata: {
        workspace_id: workspace.id,
        plan_key: plan.key,
        ...(identity.orgId ? { clerk_org_id: identity.orgId } : {}),
      },
    },
  });

  return session.url
    ? json(origin, { url: session.url })
    : json(origin, { message: 'Stripe did not return a Checkout URL.' }, 502);
});

