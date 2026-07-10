# Sites By Leon client dashboard

This is the separate server-rendered account area for photography clients. It deliberately does not turn the public marketing site into a server application.

## What is implemented

- Clerk Astro middleware and protected dashboard routes
- Clerk Organization requirement before workspace data is shown
- Supabase client access using the current Clerk session token
- Organization-scoped project, request, subscription, and connected-payment status
- Tested Essential `$25`, Studio `$30`, and Signature `$40` monthly plan map
- Server endpoints for Stripe Checkout and the Stripe Customer Portal
- A cinematic responsive dashboard matching the public brand
- A development-only `?preview=true` route used for visual tests; it is impossible in production builds

## Required configuration

Copy `.env.example` to `.env` for local work. The Supabase URL, publishable key, and function URLs are safe browser values and are already recorded. Add Clerk **test-mode** keys locally; never commit `CLERK_SECRET_KEY`.

Cloudflare Worker secrets and variables:

```text
PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_PUBLISHABLE_KEY
PUBLIC_MARKETING_SITE_URL
PUBLIC_CHECKOUT_FUNCTION_URL
PUBLIC_PORTAL_FUNCTION_URL
```

Supabase Edge Function secrets and variables:

```text
DASHBOARD_ORIGIN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ESSENTIAL
STRIPE_PRICE_STUDIO
STRIPE_PRICE_SIGNATURE
```

`create-checkout` and `create-portal` must stay deployed with JWT verification enabled. `stripe-webhook` intentionally disables Supabase JWT verification because it verifies Stripe's signature against the exact raw request body.

## Verification

```bash
pnpm check
pnpm test
pnpm build
pnpm test:e2e
```

No live Stripe secret, live price, or live webhook should be configured until all test-mode flows pass.
