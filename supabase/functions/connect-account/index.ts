
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { readInternalIdentity } from '../_shared/internal-auth.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

const allowedOrigins = (Deno.env.get('PORTFOLIO_ADMIN_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const headers = (origin: string | null) => ({
  ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  Vary: 'Origin',
});
const json = (origin: string | null, body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

async function stripeRequest(path: string, body?: object) {
  const key = Deno.env.get('STRIPE_CONNECT_SECRET_KEY');
  if (!key) return null;
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      ...(path.startsWith('/v2/') ? { 'Stripe-Version': '2026-06-24.preview' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  return response.ok ? payload : null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return origin && allowedOrigins.includes(origin)
    ? new Response(null, { status: 204, headers: headers(origin) })
    : json(origin, { message: 'Origin not allowed.' }, 403);
  if (request.method !== 'POST') return json(origin, { message: 'Method not allowed.' }, 405);
  if (!origin || !allowedOrigins.includes(origin)) return json(origin, { message: 'Origin not allowed.' }, 403);

  const identity = readInternalIdentity(request);
  if (!identity) return json(origin, { message: 'Sign in to connect Stripe.' }, 401);
  const supabase = createSupabaseAdmin();
  if (!supabase || !Deno.env.get('STRIPE_CONNECT_SECRET_KEY')) {
    return json(origin, { message: 'Stripe Connect is not configured yet.' }, 503);
  }

  const input = await request.json().catch(() => null);
  const workspaceSlug = typeof input?.workspaceSlug === 'string' ? input.workspaceSlug : '';
  const action = input?.action === 'status' ? 'status' : 'start';
  const { data: workspace } = await supabase.from('client_workspaces').select('id,name').eq('slug', workspaceSlug).maybeSingle<{ id: string; name: string }>();
  if (!workspace) return json(origin, { message: 'Studio not found.' }, 404);
  const { data: member } = await supabase.from('workspace_members').select('role').eq('workspace_id', workspace.id).eq('clerk_user_id', identity.userId).maybeSingle<{ role: string }>();
  const { data: admin } = await supabase.from('app_admins').select('clerk_user_id').eq('clerk_user_id', identity.userId).maybeSingle();
  if (!admin && !member?.role?.match(/^(owner|admin)$/)) return json(origin, { message: 'Studio owner access required.' }, 403);

  let { data: connection } = await supabase.from('connected_payment_accounts').select('stripe_account_id').eq('workspace_id', workspace.id).maybeSingle<{ stripe_account_id: string }>();
  if (connection && action === 'status') {
    const account = await stripeRequest(`/v1/accounts/${encodeURIComponent(connection.stripe_account_id)}`);
    if (!account) return json(origin, { message: 'Stripe account status is unavailable.' }, 502);
    const update = {
      onboarding_status: account.charges_enabled && account.payouts_enabled ? 'enabled' : account.details_submitted ? 'restricted' : 'pending',
      charges_enabled: account.charges_enabled === true,
      payouts_enabled: account.payouts_enabled === true,
      details_submitted: account.details_submitted === true,
    };
    await supabase.from('connected_payment_accounts').update(update).eq('workspace_id', workspace.id);
    return json(origin, { ok: true, ...update });
  }

  if (!connection) {
    const account = await stripeRequest('/v2/core/accounts', {
      display_name: workspace.name,
      dashboard: 'full',
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
        locales: ['en-US'],
      },
      metadata: { workspace_id: workspace.id },
      include: ['configuration.merchant', 'requirements'],
    });
    if (!account?.id) return json(origin, { message: 'Stripe account could not be created.' }, 502);
    const { error } = await supabase.from('connected_payment_accounts').insert({
      workspace_id: workspace.id,
      stripe_account_id: account.id,
      onboarding_status: 'pending',
    });
    if (error) return json(origin, { message: 'Stripe account could not be saved.' }, 503);
    connection = { stripe_account_id: account.id };
  }

  const accountLink = await stripeRequest('/v2/core/account_links', {
    account: connection.stripe_account_id,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: ['merchant'],
        collection_options: { fields: 'eventually_due', future_requirements: 'include' },
        return_url: `${origin}/admin/invoices?connect=return`,
        refresh_url: `${origin}/admin/invoices?connect=refresh`,
      },
    },
  });
  return accountLink?.url
    ? json(origin, { url: accountLink.url })
    : json(origin, { message: 'Stripe onboarding could not start.' }, 502);
});

