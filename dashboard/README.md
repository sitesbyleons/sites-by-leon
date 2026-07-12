# Sites By Leon dashboard

This is the server-rendered client and Leon administration area hosted on the OVH VPS.

## Included

- Clerk sign-in and sign-up with personal accounts; Organizations are optional.
- Client projects, content requests, subscription status, and billing controls.
- Leon-only user, site, subscription, and ticket administration pages.
- Direct private PostgreSQL access over the internal Docker network.
- Direct Stripe Checkout, Customer Portal, and signed webhook handling.

## Required server configuration

Copy `.env.example` to an ignored environment file and set:

```text
PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
DATABASE_URL
PUBLIC_MARKETING_SITE_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ESSENTIAL
STRIPE_PRICE_STUDIO
STRIPE_PRICE_SIGNATURE
```

The Stripe billing webhook destination is `https://leonsites.org/api/webhooks/stripe`. Never expose `DATABASE_URL`, Clerk's secret key, or Stripe secret values to browser code.

## Verification

```bash
pnpm --filter sites-by-leon-dashboard check
pnpm --filter sites-by-leon-dashboard test
pnpm --filter sites-by-leon-dashboard build
```
