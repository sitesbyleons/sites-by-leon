# Photographer Site Platform Design

## Purpose

Sites By Leon will provide photographers with individually hosted portfolio websites that Leon owns and operates as a managed service. Each photographer receives a private content dashboard for routine updates, while Leon retains control of source code, deployments, domains, platform configuration, and structural site changes.

The first implementation is a production-shaped fictional portrait studio called **Northline Portraits**. It is both a sales demo and the reusable base for future client sites. It must behave like a real hosted client site, use fake names and portfolio content honestly, and exercise the same authentication, content, payment, and control paths that production sites will use.

## Locked Ownership Model

- Sites By Leon owns every private GitHub repository.
- Sites By Leon owns every Vercel project and deployment.
- Sites By Leon purchases, renews, and configures every client domain.
- Each photographer owns their business content and customer relationship, but receives no source-code, DNS, or hosting access.
- A photographer can access only the protected studio dashboard attached to their own workspace and site.
- Leon can monitor, pause, maintain, or disconnect a hosted site from the central admin panel.
- A paused site shows a controlled service notice without deleting content or blocking the photographer's studio dashboard.
- If a service relationship ends, content export and domain-transfer terms are handled through the service agreement rather than an automated self-service transfer.

## Platform Boundaries

### Independent client deployment

Every client site has its own private repository, Vercel project, environment variables, deployment history, and custom domain under the Sites By Leon business accounts. A problem or rollback on one client site does not redeploy another client site.

The first template will live in the existing monorepo while it is developed. Once stable, it becomes the source used to create a dedicated repository for each paying client. Template updates are applied deliberately per client instead of silently changing every website at once.

### Shared control plane

Clerk, Supabase, Stripe Connect, and the Leon admin application form one shared, tenant-scoped control plane. Every record is keyed to a `workspace_id` and `site_id`. Clerk remains the identity provider; Supabase Row Level Security authorizes reads and writes through direct workspace membership. Organizations remain optional.

### Site identity

Each deployment receives server-only configuration:

- `LEON_SITE_ID` — stable site UUID.
- `LEON_SITE_SECRET` — rotatable per-site secret used only for server-to-server requests.
- `LEON_CONTROL_URL` — base URL for the Leon control API.
- Clerk and Supabase public configuration required by the owner dashboard.

The site secret is never exposed in browser code. The control plane stores only a one-way hash of the secret and supports rotation without changing the site ID.

## Northline Portraits Demo

### Public website

Northline Portraits is a fictional cinematic portrait studio. The public site contains:

1. **Home** — short introduction, featured work, current announcement, and contact action.
2. **Work** — published galleries with cover images and clear categories.
3. **Gallery detail** — an image-led sequence with captions and accessible alternative text.
4. **Journal** — published stories and recent sessions.
5. **Journal post** — cover image, date, body content, and related gallery.
6. **Packages** — fixed packages shown as descriptive starting points. No package can be bought directly. Every action says **Ask about this package** and starts a conversation with the photographer.
7. **Contact** — a focused inquiry form for availability and project details.
8. **Invoice payment** — an unlisted, tokenized page reached through a link sent by the photographer.

The demo domain is planned as `northline.test.leonsites.org`. Until DNS is configured, its Vercel production URL is the canonical test address.

### Visual direction

The site uses a restrained editorial portrait language rather than the Sites By Leon business UI. The public site is image-first, uses deep ink and gallery-white surfaces, and pairs a narrow display face with a highly readable body face. Its signature element is a horizontal contact-sheet ribbon that lets visitors move between portrait stories without turning the page into a grid of identical cards.

Motion is always enabled as requested, but animation never hides content or prevents navigation. Page entrances and gallery transitions remain short, and `prefers-reduced-motion` still removes large spatial movement for accessibility.

## Photographer Studio Dashboard

The protected dashboard lives at `/studio` on the photographer's own domain. Clerk redirects signed-out visitors to sign in and returns them to the requested studio page.

The dashboard contains separate pages:

### Overview

- Published and draft post counts.
- Published gallery count.
- Open invoices, deposits awaiting payment, and recent payments.
- Site status and public-domain link.
- Leon support request shortcut.

### Posts

- List drafts and published posts.
- Create, edit, preview, publish, and unpublish a post.
- Fields: title, slug, excerpt, body, cover image, related gallery, and publish date.
- Body content uses a constrained rich-text format. Arbitrary HTML, scripts, custom CSS, and page-layout controls are prohibited.

### Galleries

- Create, rename, reorder, publish, and unpublish galleries.
- Upload, remove, caption, and reorder images.
- Set one cover image.
- Require alternative text for meaningful images before publishing.
- Prevent deletion of a gallery that is referenced by a published post until the reference is removed.

### Homepage

- Edit the approved basic fields: introduction, short biography, announcement, contact call-to-action label, and featured gallery selection.
- Replace approved homepage image slots with existing uploaded images.
- Layout, navigation, fonts, colors, sections, packages, and custom pages remain Leon-managed structural work.

### Invoices

- Create a draft invoice for an agreed photography job.
- Add a customer name, customer email, description, line items, due date, currency, and private notes.
- Choose either full payment or a deposit.
- A deposit can be a fixed amount or a percentage of the invoice total.
- Publishing an invoice creates an unguessable share link.
- Copy the payment link for manual delivery to the customer.
- Mark an unpaid invoice void; paid invoices are immutable except for internal notes.
- Fixed website packages can be selected as an invoice starting point, but never create a public checkout without photographer approval.

### Payments

- Show payment state for invoices and deposits.
- Show amount, customer, invoice, payment date, and Stripe status.
- Link the photographer to their connected Stripe Dashboard for refunds, disputes, payout details, and bank settings.
- Never display or store card numbers.

### Support

- Create a request for new pages, package changes, layout changes, custom integrations, or other work outside the permitted content fields.
- Display request status from the shared Leon support queue.

## Customer Invoice and Deposit Flow

1. The customer contacts the photographer about a package or custom session.
2. The photographer agrees on scope and price outside the website.
3. The photographer creates an invoice and chooses full payment or a deposit.
4. The server validates totals and creates the Stripe customer and invoice or Checkout payment on the photographer's connected account.
5. The dashboard receives a tokenized payment URL and the photographer shares it manually.
6. The customer sees the photographer's identity, invoice summary, amount due, and due date before entering Stripe-hosted Checkout.
7. Stripe processes the payment without exposing card data to the site.
8. A verified Connect webhook updates the local invoice and payment records idempotently.
9. The success page reflects webhook-confirmed state. It does not mark an invoice paid merely because the browser returned from Checkout.

Fixed package pages are brochure content only. Their call to action opens the inquiry path and can include the package name in the inquiry. They never expose a direct purchase button.

## Stripe Connect Model

Sites By Leon operates as a SaaS platform. The photographer is the merchant of record for their photography services.

- Use connected accounts with full Stripe Dashboard access and direct charges.
- Stripe collects processing fees from the connected photographer account.
- The photographer is responsible for refunds, disputes, and negative balances associated with their direct charges.
- Sites By Leon does not take an application fee in the first release.
- Customer, invoice, Checkout, PaymentIntent, and charge objects are created in the connected account context.
- Webhook handling listens for connected-account events and records both the connected account ID and Stripe event ID.
- The payment page and receipt clearly identify the photographer as the seller.
- The Leon admin can see normalized operational status and totals stored in Supabase, but sensitive payment operations remain in Stripe.

This matches Stripe's documented SaaS/direct-charge model: direct charges live on the connected account, the connected account is the merchant of record, and full-Dashboard accounts manage their own payments and disputes.

References:

- https://docs.stripe.com/connect/direct-charges
- https://docs.stripe.com/connect/merchant-of-record
- https://docs.stripe.com/invoicing/connect
- https://docs.stripe.com/connect/accounts

## Leon Control Plane

### Admin pages

The current Leon admin expands with:

- **Clients** — workspace, owner, subscription, connected payment state, and support history.
- **Sites** — domain, repository, Vercel project, template version, deployment state, health state, and public status.
- **Issues** — failed health checks, failed deployments, control API errors, webhook errors, and unresolved support tickets.
- **Payments** — normalized connected-account and customer-payment status without card data.
- **Controls** — pause, resume, maintenance message, rotate site secret, and request a fresh health check.

Destructive controls require a confirmation screen and an audit record. Pausing never deletes a repository, deployment, domain, content record, invoice, or payment.

### Site control API

The shared dashboard exposes versioned server endpoints:

- `GET /api/v1/site/config` — returns the site's public operating status, maintenance message, template minimum version, and content revision.
- `POST /api/v1/site/heartbeat` — records deployed commit, template version, runtime version, timestamp, and non-sensitive health checks.
- `POST /api/v1/site/issues` — records sanitized runtime or content errors.

Requests include site ID, timestamp, nonce, and an HMAC signature created with the site secret. The server rejects expired timestamps and reused nonces. Responses never include credentials or data for another site.

The client website checks control status server-side with a short cache. If the control plane is temporarily unavailable, the site fails open using the last known active state so a control-plane outage does not take every photographer offline. An explicit paused state remains cached until a verified active response is received.

### Health behavior

- Each site exposes a minimal `/api/health` response with no private data.
- The control plane tracks last successful heartbeat and most recent error.
- Health states are `healthy`, `degraded`, `offline`, or `unknown`.
- A missed heartbeat does not automatically pause a site.
- Leon receives a visible issue in the admin panel before deciding whether to act.

## Data Model

All client-owned tables include `workspace_id`; site-specific tables also include `site_id`.

### Hosting and control

- `hosted_sites` — workspace, name, slug, domain, repository, Vercel project, template version, operating status, maintenance message, secret hash, content revision, and health timestamps.
- `site_heartbeats` — site, commit, template version, runtime, health summary, and received time.
- `site_issues` — site, severity, source, code, sanitized message, first seen, last seen, count, and resolved time.
- `site_control_audit` — actor, action, prior value, new value, site, and timestamp.
- `site_api_nonces` in the private schema — replay-protection values with automatic expiry.

### Content

- `site_home_content` — approved homepage fields and featured-gallery references.
- `site_posts` — title, slug, excerpt, constrained rich-text body, cover image, related gallery, status, and publish timestamps.
- `site_galleries` — title, slug, description, cover image, status, sort order, and publish timestamps.
- `site_gallery_images` — gallery, asset, alt text, caption, dimensions, and sort order.
- `site_assets` — owner, storage path, media type, dimensions, state, and timestamps.
- `site_packages` — Leon-managed display content and inquiry label; read-only to photographers.

### Customer payments

- `customer_invoices` — site, connected account, customer identity, totals, currency, payment mode, deposit configuration, status, due date, public-token hash, and Stripe references.
- `customer_invoice_items` — invoice, description, quantity, unit amount, and sort order.
- `customer_payments` — invoice, connected account, amount, currency, Stripe references, status, and paid time.
- Existing `connected_payment_accounts` is extended with onboarding and capability state.
- Connected Stripe webhook events use the private idempotency ledger.

## Media Storage

- Draft uploads enter a private `portfolio-drafts` bucket.
- Publishing copies approved files to a cacheable `portfolio-public` bucket under a site-specific path.
- Unpublishing removes the public copy after the content transaction succeeds.
- Owner upload, update, and delete policies require direct workspace membership.
- Public visitors can read only published media.
- File type, pixel dimensions, and size are validated before storage.
- EXIF metadata is removed during image processing to avoid leaking location or device information.

## Authorization

### Photographer

A photographer with `owner` or `admin` membership can manage permitted content, invoices, and their own site records. They cannot modify hosting state, site identity, repository details, Vercel details, domain fields, package layout, another workspace, or Leon audit data.

### Leon admin

Only users listed in `app_admins` can access central controls. Admin mutations run server-side, require a fresh Clerk session, validate the target site, and append an audit row.

### Public customer

Public visitors can read published content through site-scoped endpoints. An invoice page requires its high-entropy token. The database stores only a token hash. Payment-session creation revalidates invoice state, amount, due date, site status, connected-account capability, and token before contacting Stripe.

## Deployment Workflow

1. Leon creates a client workspace and hosted-site record.
2. The platform generates a site secret and displays it once.
3. Leon creates a private repository from the approved photographer template.
4. Leon creates a Vercel project under the Sites By Leon account and connects the repository.
5. Required environment variables are configured in Vercel.
6. Leon attaches the owned custom domain and preserves required email DNS records.
7. The first deployment sends a signed heartbeat.
8. The Leon admin marks the site active after health and browser checks pass.

Client sites do not deploy from photographer content changes. Published content is read from the shared content service, so posts and galleries appear without a Git commit. Code and structural changes continue through GitHub and Vercel.

## Failure and Edge Cases

- A control-plane outage does not automatically take client sites offline.
- A paused site leaves `/studio` available to the owner and shows a Leon-controlled notice on public pages.
- Failed media publishing preserves the draft and leaves the currently published version unchanged.
- Duplicate Stripe webhooks produce one payment-state transition.
- An expired, paid, void, or mismatched invoice cannot create another Checkout session.
- Customer return URLs do not change payment status without a verified webhook.
- Failed Stripe onboarding keeps invoice publishing disabled and explains how the photographer can finish setup.
- Invalid site signatures, reused nonces, and cross-site identifiers return generic authorization errors and create sanitized security events.
- A client can never pause, resume, or delete their own hosted site from the photographer dashboard.

## First Delivery Sequence

### Slice 1 — Northline public site

- Reusable independent Astro/Vercel site application.
- Public pages, fake editorial content, and a substantial cinematic image set.
- Responsive navigation, galleries, journal, packages, inquiry, and maintenance state.
- Local and deployed browser verification.

### Slice 2 — Photographer content studio

- Shared Clerk authentication and membership checks.
- Posts, galleries, image management, homepage fields, previews, and publishing.
- Supabase content tables, storage policies, and RLS tests.

### Slice 3 — Invoices and deposits

- Connected-account onboarding state.
- Invoice/deposit editor and tokenized customer payment page.
- Stripe-hosted payment flow, connected webhooks, payment status, and test-mode verification.

### Slice 4 — Leon site operations

- Hosted-site registry, signed control API, heartbeat, issues, pause/resume, audit trail, and central admin pages.
- Vercel and GitHub identifiers stored for each site.
- End-to-end pause, resume, and failure-reporting tests.

## Verification

### Automated

- Type checks and production builds for the template and control plane.
- Unit tests for content validation, invoice totals, deposits, token hashing, signatures, replay protection, pause decisions, and webhook idempotency.
- Database tests proving owner, public, other-client, and Leon-admin access boundaries.
- Browser tests for desktop and iPhone layouts, keyboard navigation, accessibility, post publishing, gallery ordering, invoice creation, payment return states, and maintenance mode.

### Stripe test mode

- Successful full invoice.
- Successful fixed and percentage deposit.
- Canceled Checkout.
- Failed or delayed payment.
- Repeated connected-account webhook.
- Paid invoice replay attempt.
- Refund and dispute visibility through the connected account.

### Operations

- Create a fresh private repository and Vercel project from the template.
- Attach a test subdomain.
- Verify a signed heartbeat appears in Leon admin.
- Pause and resume the public site without blocking `/studio`.
- Confirm no secret appears in browser bundles, HTML, Git history, logs, or public API responses.

## Acceptance Criteria

The platform slice is ready when Northline behaves like a real independent client site; its photographer can safely manage posts, galleries, images, homepage text, invoices, deposits, and payment links; packages remain inquiry-only; customer funds are processed on the photographer's connected Stripe account; and Leon can monitor, pause, and resume the site from the central admin without accessing or deleting customer card data.
