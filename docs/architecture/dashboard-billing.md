# Dashboard and billing architecture

## Current boundary

The public Astro site stays static and public. The `dashboard/` application is a separate Astro 6 server build for Cloudflare because Clerk's current Astro SDK supports Astro 4–6 and requires server middleware. Its dependency versions are isolated from the Astro 7 marketing site.

Clerk is the identity authority. A client must be signed in and have an active Clerk Organization before the dashboard looks up data. Supabase's current native Clerk third-party authentication path is used; the deprecated custom JWT template is not used.

## Data access

Public tables have Row Level Security enabled. Client reads are tied to the active Clerk organization claim, accepting both the classic `org_id` and compact `o.id` token shapes. Browser roles receive only these grants:

- `client_workspaces`: select the active organization
- `workspace_members`: select the current user's membership in the active organization
- `website_projects`: select active-organization projects
- `subscriptions`: select normalized active-organization billing state
- `content_requests`: select and insert within the active organization
- `connected_payment_accounts`: select server-managed Connect status

Anonymous users receive no table grants. Stripe event idempotency records live in the unexposed `app_private` schema.

## Sites By Leon subscriptions

The Stripe planner selected fixed-price Stripe-hosted Checkout, Customer Portal, Smart Retries, and verified webhooks. Checkout is available only after Leon marks a workspace `approved` or `active`, and it is rejected while a live subscription state already exists.

The three server functions are deployed but inert until test-mode secrets are configured:

- `create-checkout` — verified Clerk JWT required
- `create-portal` — verified Clerk JWT required
- `stripe-webhook` — public endpoint with mandatory Stripe signature verification

The webhook uses a private retry ledger. A completed event is idempotent; a failed or expired processing lease can be retried safely.

## Photographer customer payments

Stripe's planner classified this as a later SaaS Platform Connect flow, not a marketplace. The intended model is:

- each photographer is merchant of record;
- direct charges run on that photographer's connected account;
- Stripe owns processing pricing initially;
- photographers manage their own disputes in the full Stripe Dashboard;
- embedded onboarding and the notification banner keep requirements current;
- no per-transaction Sites By Leon fee at first;
- capability status is checked before any customer checkout is shown.

Only the status table exists today. No Connect account creation or customer charge path is active until test accounts, onboarding, refunds, disputes, webhooks, and payouts are verified.
