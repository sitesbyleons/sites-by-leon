# Northline Sports deployment

Northline Sports is the production-style photographer-site example owned by Sites By Leon. It is served from the OVH VPS at <https://demo.leonsites.org> and follows the same architecture planned for future client sites.

## Ownership and hosting

- Private GitHub source under the Sites By Leon business account
- Dockerized Astro server on the Sites By Leon OVH VPS
- Cloudflare DNS and private Tunnel routing
- Plain PostgreSQL 17 database shared through workspace-scoped records
- Tenant-prefixed managed images in the local upload fallback or private S3-compatible media storage
- Clerk authentication for the studio administration routes
- Stripe Connect and invoice routes running inside the site container

The application is not publicly exposed by an origin port. Cloudflare Tunnel forwards only configured hostnames to the Caddy gateway, and the gateway sends photographer hosts to one shared `photographer` container. That runtime resolves the exact hostname to a workspace and rejects unknown hosts, so adding customers does not create a new privileged container or database pool per site.

## Control-plane boundary

The site has a unique `SITE_KEY` and internal control token stored only on the VPS. The Sites By Leon dashboard can read status, pause the public site, and inspect the deployed version through authenticated server-to-server routes. Browser requests never receive the shared control credential.

## Public and protected routes

- `/`, `/work`, `/journal`, `/packages`, and `/contact` are public.
- `/admin`, `/sign-in`, and content mutation APIs require Clerk authentication.
- `/api/health` exposes only non-sensitive availability metadata.
- `/invoice/:token` is intended for shareable client invoice links.

## Verification

Unit, Astro diagnostic, production build, and Playwright suites cover desktop and iPhone widths, horizontal overflow, accessibility, public pause boundaries, gallery and journal fixtures, packages, contact behavior, uploads, content management, and invoice validation.
