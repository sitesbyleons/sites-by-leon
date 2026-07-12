# Sites By Leon

Sites By Leon is a photographer-focused website design and managed-hosting platform. The production stack is fully self-hosted on the Sites By Leon OVH VPS, while GitHub remains the private source repository.

## Live domains

- `https://leonsites.org` — public coming-soon page
- `https://leonsites.org/admin` — private Sites By Leon administration area
- `https://test.leonsites.org` — complete marketing preview
- `https://demo.leonsites.org` — Northline Sports photographer site
- `https://api.leonsites.org/media/*` — persistent image delivery

Cloudflare provides authoritative DNS and a private Tunnel to the VPS. The VPS does not expose the application or database ports publicly.

## Architecture

- `src/` — static marketing site and coming-soon experience
- `dashboard/` — server-rendered client and Sites By Leon administration dashboard
- `photographer-site/` — production-style sports photographer site and studio controls
- `platform-core/` — shared PostgreSQL, billing, and image-storage helpers
- `infra/ovh/` — Docker Compose, Caddy gateway, PostgreSQL schema, import tools, and health checks
- `/opt/leon-platform/uploads` on the VPS — persistent image storage
- Docker-managed PostgreSQL 17 volume — persistent application database

Authentication is provided by Clerk. Subscription billing, customer portal sessions, photographer Stripe Connect onboarding, and invoices are handled by server routes running on the VPS.

## Local development

Use Node.js 24 and pnpm 11.7.0.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Run the server-rendered applications separately when needed:

```bash
pnpm --dir dashboard dev
pnpm --dir photographer-site dev
```

## Verification

```bash
pnpm check
pnpm test
pnpm build
pnpm test:e2e
pnpm --dir dashboard check
pnpm --dir dashboard test
pnpm --dir dashboard build
pnpm --dir photographer-site check
pnpm --dir photographer-site test
pnpm --dir photographer-site build
```

The browser suite covers mobile and desktop overflow, accessibility, the coming-soon host switch, permanent scroll motion, concept previews, pricing, and contact behavior.

## Deployment

Follow [`infra/ovh/README.md`](./infra/ovh/README.md). Production secrets stay only in root-readable files on the VPS. GitHub Actions verifies the source, but GitHub does not host the live application.

## Design sources

- [Penpot website system](https://design.penpot.app/#/workspace?team-id=f2b396a6-c4f1-8031-8008-4dd0fec860ae&file-id=42558d4e-b644-80d6-8008-4dd862ca6b8a&page-id=42558d4e-b644-80d6-8008-4dd862ca6b8b)
- [Canva brand direction](https://www.canva.com/design/DAHO88fiYBg/view)

Never commit Clerk, Stripe, database, Cloudflare Tunnel, or other production secrets.
