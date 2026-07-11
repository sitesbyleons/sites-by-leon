# sites.by.leon

A bold, cinematic marketing site for an affordable website-design and managed-hosting service built specifically for photographers.

The public site is an Astro static build. It presents three clearly labeled concept projects, monthly packages from `$25` to `$40`, an honest direct-email fallback, legal pages, and a Supabase-ready inquiry function.

## What is live in Phase 1

- Photographer-focused website design and managed hosting
- Essential `$25/month`, Studio `$30/month`, and Signature `$40/month`
- Domains and payment-system setup in every plan
- Template-based Essential and Studio plans; custom-made Signature sites
- No separate build fee
- Three original examples marked `Concept Project`
- Direct contact at `sites.by.leon@gmail.com`
- Responsive layouts for mobile through wide desktop
- Reduced-motion support and automated accessibility checks

The separate Clerk client dashboard, Supabase workspace schema, and Stripe server-function foundation are implemented in the repository. They remain a separate launch gate: no account or payment feature is presented as active until Clerk, Cloudflare, and Stripe test-mode configuration is complete.

## Technology

- Astro 7 static output
- TypeScript 6
- Local Fontsource packages for Cormorant, Manrope, and Allura
- Vitest unit tests
- Playwright and Axe browser/accessibility tests
- Supabase Postgres and Edge Function source for inquiries
- Clerk Astro server middleware for the separate Phase 2 dashboard
- Supabase Row Level Security keyed to active Clerk Organizations
- Stripe Checkout, Customer Portal, and signed webhook Edge Functions deployed in an inert state
- Stripe Connect status foundation for the later photographer-payments launch gate
- GitHub source history and quality checks
- Cloudflare Pages production hosting

## Local development

Use Node.js 24 and pnpm 11.7.0.

```bash
pnpm install
pnpm dev
```

The development site opens at `http://localhost:4321` by default.

The client dashboard is isolated in `dashboard/` because it requires server rendering:

```bash
pnpm --dir dashboard dev
```

## Verification

```bash
pnpm check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser checks cover positioning copy, concept honesty, pricing, contact fallback, legal routes, serious/critical Axe violations, reduced motion, and horizontal overflow at 390, 768, and 1440 pixels.

## Contact configuration

Copy `.env.example` to `.env` only when a Supabase project and Edge Function are ready:

```text
PUBLIC_CONTACT_FUNCTION_URL=https://YOUR_PROJECT.supabase.co/functions/v1/contact
```

When the variable is empty, the form explains that online sending is not connected and preserves the visitor’s values. The direct `mailto:sites.by.leon@gmail.com` link remains visible at all times.

### Supabase boundary

The repository includes:

- `supabase/migrations/202607100001_create_contact_inquiries.sql`
- `supabase/functions/contact/index.ts`
- `supabase/functions/contact/deno.json`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/create-portal/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

The migration enables Row Level Security and grants no browser role access. The Edge Function validates the payload again, restricts allowed origins, checks a honeypot, hashes the source IP for rate limiting, and uses a server-only service role.

Configure these Edge Function secrets in Supabase, never in Astro or GitHub:

```text
SITE_ORIGIN=https://your-production-domain.example
CONTACT_HASH_SALT=a-long-random-secret
```

The public function URL belongs in `PUBLIC_CONTACT_FUNCTION_URL`; the service-role credential does not.

Client-platform migrations add organization-scoped workspaces, projects, content requests, subscription state, a private Stripe event ledger, and inactive Connect status. A rollback-only policy test proved that one Clerk organization can see and write only its own rows; the cross-organization write was rejected by Row Level Security.

## Design sources

- Penpot: [`sites.by.leon — Website System`](https://design.penpot.app/#/workspace?team-id=f2b396a6-c4f1-8031-8008-4dd0fec860ae&file-id=42558d4e-b644-80d6-8008-4dd862ca6b8a&page-id=42558d4e-b644-80d6-8008-4dd862ca6b8b)
- Canva brand direction: [`DAHO88fiYBg`](https://www.canva.com/design/DAHO88fiYBg/view)
- Review records: [`docs/design`](./docs/design)

The editable Canva share URL and the personal Penpot MCP key are intentionally excluded from the repository.

## Deployment

Cloudflare Pages should use:

- Build command: `pnpm build`
- Output directory: `dist`
- Node.js: `24`
- pnpm: `11.7.0`

GitHub remains the source repository, but production is not hosted on GitHub Pages. GitHub’s published Pages limits prohibit using Pages to run an online business or facilitate commercial transactions, while this website exists to sell design and hosting services.

The final production URL will be recorded here after the Cloudflare Pages project is connected and verified.

## Product boundaries

### Phase 2 — accounts and subscriptions (foundation built; configuration pending)

- Clerk authentication and Organizations in a separate server-rendered dashboard
- Project progress, update requests, plan status, and personal support UI
- Stripe Checkout for the `$25`, `$30`, and `$40` monthly subscriptions
- Stripe Customer Portal
- Signed, retryable, idempotent webhook updates stored in Supabase

See [`dashboard/README.md`](./dashboard/README.md) and [`docs/architecture/dashboard-billing.md`](./docs/architecture/dashboard-billing.md) for the remaining service configuration and payment boundaries.

### Phase 3 — photographer payments

- Stripe Connect onboarding for eligible photographer clients
- Connected-account status and payout handling
- Site-specific deposits or customer-payment experiences
- Refund, dispute, and webhook lifecycle testing

No secret Clerk, Supabase, or Stripe credential belongs in this repository. The committed Supabase publishable key is intentionally browser-safe and is still constrained by Row Level Security.
