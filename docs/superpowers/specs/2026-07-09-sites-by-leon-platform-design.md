# sites.by.leon Platform Design

## Purpose

`sites.by.leon` sells fully managed websites to photographers through affordable monthly subscriptions. The service combines website design, managed static hosting, maintenance, and personal support so photographers do not need to manage technical work themselves.

The first release must earn trust even though the business has no client projects yet. It will use three clearly labeled concept projects to demonstrate the quality and range of the service without presenting fictional work as real client work.

## Positioning

The brand promises three benefits in this order:

1. Effortless service: design, hosting, updates, and support are handled for the client.
2. Photographer specialization: the layouts, calls to action, galleries, and mobile behavior are designed around photography businesses.
3. Affordable access: plans cost between $30 and $100 per month with no separate website build fee.

Primary message:

> Websites for photographers, without the website headache.

Supporting message:

> Designed, hosted, and cared for in one simple monthly plan.

The primary call to action is **Contact**. It leads to the contact section and presents `sites.by.leon@gmail.com` as a direct alternative.

## Audience

The initial audience is independent wedding, portrait, and commercial photographers who need a professional web presence but do not want to design, host, or maintain it themselves. Visitors should understand the offer within a few seconds and feel that the service is personal, premium, and attainable.

## Visual Direction

The experience combines bold cinematic composition with restrained luxury. It must feel like a web design studio serving photographers, not like Leon is presenting himself as a photographer.

### Identity

- Near-black graphite backgrounds and warm ivory surfaces create the cinematic base.
- Muted silver supports secondary text and dividers.
- Electric blue is used sparingly for interactive states, light sweeps, and selected details.
- A handwritten **Leon** signature is paired with a precise `sites.by.leon` wordmark.
- Editorial serif headlines are paired with a modern sans-serif for navigation, body copy, labels, and controls.
- Oversized browser-window compositions present the concept sites as designed digital products.
- Subtle grain, slow image reveals, restrained light movement, and layered depth add atmosphere without interfering with readability.

### Accessibility and Motion

- Text and controls must meet WCAG AA contrast requirements.
- Keyboard focus must always be visible.
- All important content remains available without animation.
- `prefers-reduced-motion` disables parallax, light sweeps, and long transitions.
- Photography assets include meaningful alternative text unless they are purely decorative.

## Homepage Structure

### 1. Floating navigation

The header contains the Leon signature, `sites.by.leon`, Work, Services, Pricing, and Contact. It begins transparent over the hero and gains a blurred graphite surface after the visitor scrolls. Contact is the only emphasized navigation action.

### 2. Cinematic hero

The hero uses the primary and supporting messages, a Contact button, and an animated browser mockup. The browser mockup previews one concept photography site and establishes that websites—not photography services—are the product.

### 3. Core promise

Three concise points explain that each site is built for photographers, fully managed, and offered through simple monthly pricing.

### 4. Concept website showcase

Three projects are labeled as concepts:

- **Vow & Light** — editorial wedding photography.
- **Northline Portraits** — bold portrait studio.
- **Fieldwork Commercial** — minimal commercial photography.

Each project uses a large browser frame, mobile companion view, short design rationale, and a clearly visible **Concept Project** label. Desktop interactions reveal project details; mobile uses a swipeable or stacked presentation without hiding content.

### 5. How it works

The process is presented as four steps:

1. Contact Leon.
2. Shape the content and visual direction together.
3. Review and approve the site.
4. Launch while Leon handles hosting and ongoing care.

### 6. Monthly packages

The initial package structure is editable content, but the first design uses:

- **Essential — $30/month:** a focused starter presence for photographers who need a polished online home.
- **Studio — $65/month:** a fuller portfolio and inquiry experience for active photography businesses.
- **Signature — $100/month:** a larger, more customized site with priority support and expanded features.

All packages state that there is no separate build fee. Final feature limits can be adjusted before public launch without changing the card layout.

### 7. Everything handled

This section covers responsive design, managed hosting, content updates, security maintenance, backups, inquiry forms, and personal support. Claims must match the actual operational service before launch.

### 8. Optional client payments

The page briefly explains that eligible photography websites can later add booking deposits or checkout payments. It does not imply that client-payment support is available until Stripe Connect has been implemented and verified.

### 9. Founder section

A concise introduction from Leon explains the goal of making strong, professionally managed websites accessible to photographers. The signature mark provides the personal finish. The copy does not claim photography experience.

### 10. Contact scene

The final section contains a short contact form and the direct email address `sites.by.leon@gmail.com`. The form asks only for name, email, photography focus, and message. A successful submission provides an immediate confirmation and does not clear the form until the server confirms receipt.

### 11. Footer

The footer repeats essential navigation, the email address, social links when available, privacy, and terms. Unavailable social profiles are omitted rather than shown as empty placeholders.

## Responsive Behavior

The desktop design uses a 1440-pixel presentation board in Penpot and a flexible content grid in code. The mobile design uses a 390-pixel Penpot board. On smaller screens:

- Sections become a fast vertical sequence.
- Browser mockups remain legible and avoid horizontal page overflow.
- Concept projects stack or swipe with equivalent keyboard-accessible controls.
- Contact remains easy to reach through the navigation and final section.
- Typography scales fluidly while preserving readable line lengths.

## Application Architecture

### Marketing frontend

The public site is a static-first application stored in GitHub and deployed through Cloudflare Pages. A content-oriented framework with static output keeps the site fast and inexpensive while allowing interactive components where needed. The published repository contains no secret keys. GitHub Pages is not used for the production business because GitHub's current published limits prohibit using Pages to run an online business or facilitate commercial transactions.

### Clerk

Clerk is the identity provider for the `sites.by.leon` client dashboard and for protected owner/admin areas on hosted client sites. The public pages of photographer websites remain accessible without an account unless a specific client product requires customer login. A single Clerk application uses Organizations to isolate client workspaces and roles. Clerk secret keys stay in server-rendered applications and functions; only publishable keys reach the browser.

The Phase 1 marketing site does not add a nonfunctional login button. Phase 2 runs the authenticated dashboard as a separate server-rendered application, such as `app.sites.by.leon`, because the current official Clerk Astro integration requires server output and middleware rather than a purely static build.

### Supabase

Supabase stores application data while accepting Clerk session tokens through its native third-party authentication integration:

- Clerk user and organization references needed by the application.
- Website projects and project status.
- Subscription references and non-sensitive billing status.
- Contact submissions.
- Optional content-update requests.

Every exposed table uses Row Level Security. Client-owned rows store the Clerk subject ID as text and policies compare it with `auth.jwt()->>'sub'`; organization-owned rows also validate approved organization and role claims. Authorization never relies on user-editable profile metadata. Supabase service-role credentials remain server-side only. The deprecated custom Supabase JWT template is not used.

### Stripe subscriptions

Stripe Checkout and the customer portal manage the `sites.by.leon` monthly website subscriptions. A Supabase Edge Function creates Checkout sessions. Stripe webhooks update subscription status after signature verification. The public frontend never receives a Stripe secret key.

### Stripe Connect

Stripe Connect is a separate later capability for photographers who want to accept payments from their own customers. Each photographer completes Stripe onboarding and receives funds through their own connected account. `sites.by.leon` never collects or stores payment-card data. This feature is not represented as active until onboarding, account status, webhooks, refunds, and payout behavior have been tested.

### Canva and Penpot

Penpot is the source for page layouts, responsive boards, components, color and type tokens, and concept-site compositions. Canva supplies the approved stacked `Sites / By / Leon` signature direction, subtle textures, and reusable promotional graphics. Exported assets are optimized before they enter the repository.

## Primary Data Flow

### Contact inquiry

1. A visitor submits the contact form.
2. The frontend validates required fields and sends the request to a protected Supabase Edge Function.
3. The function applies rate limiting and bot protection, validates the payload, and inserts the inquiry.
4. The interface reports success only after the server confirms insertion.

### Subscription purchase

1. A Clerk-authenticated client selects a plan from the client-facing purchase flow.
2. A Supabase Edge Function creates a Stripe Checkout session using the verified Clerk identity and organization context.
3. Stripe hosts the payment experience.
4. A verified webhook updates the subscription record.
5. The dashboard reads the resulting status through Supabase Row Level Security.

### Connected photographer payment

1. A photographer chooses to enable customer payments.
2. Stripe Connect handles identity and business onboarding.
3. The photographer's website creates payments against that connected account through server-side functions.
4. Verified webhooks update booking or payment status.
5. Stripe sends funds to the photographer according to the connected-account configuration.

## Error Handling

- Contact form validation explains the specific field requiring attention.
- Network failures preserve entered form content and offer a retry plus the direct email address.
- Clerk authentication failures return the client to login without exposing private data, and organization authorization failures do not reveal whether another client's records exist.
- Stripe Checkout creation failures do not change subscription state.
- Webhook handlers are idempotent so repeated Stripe events do not create repeated changes.
- Dashboard empty states explain what happens next instead of appearing broken.
- External service failures are logged server-side without displaying credentials or raw technical errors to clients.

## Delivery Phases

### Phase 1: Marketing portfolio

- Responsive homepage and brand system.
- Three clearly labeled concept projects.
- Package presentation.
- Working protected contact form.
- GitHub repository, automated Cloudflare Pages deployment, and custom-domain readiness.

### Phase 2: Client dashboard and subscriptions

- Clerk authentication and organization-scoped workspaces.
- Clerk-token-backed Supabase access for client-scoped dashboard and project records.
- Stripe subscription Checkout and customer portal.
- Verified webhook synchronization.

### Phase 3: Photographer payments

- Stripe Connect onboarding.
- Connected-account status in the dashboard.
- Reusable payment or deposit experience for eligible client sites.
- Refund, dispute, webhook, and payout-state handling.

## Verification Strategy

### Design verification

- Review desktop and mobile Penpot boards section by section.
- Confirm typeface, component, and color-token usage.
- Check that concept projects are visibly labeled.
- Check text clipping, layout overflow, focus states, and reduced-motion behavior.

### Frontend verification

- Run formatting, linting, type checks, and production builds.
- Test desktop and mobile breakpoints in a real browser.
- Test keyboard navigation and automated accessibility checks.
- Confirm no horizontal overflow at supported viewport widths.
- Confirm the Cloudflare Pages production build works at the deployment URL and through direct links.

### Supabase verification

- Configure Clerk as a native Supabase third-party authentication provider.
- Test every Row Level Security policy with multiple Clerk users and organizations.
- Confirm unauthenticated users cannot read contact submissions or client records.
- Run Supabase security and performance advisors before committing schema migrations.
- Verify the contact function's validation, rate limiting, success state, and retry behavior.

### Clerk verification

- Test signed-out, signed-in, expired-session, and organization-switching behavior.
- Confirm a user cannot access another organization's projects, subscriptions, or update requests.
- Verify Clerk webhook signatures before synchronizing non-authoritative profile data.
- Confirm no Clerk secret key appears in static output, client bundles, logs, or the Git repository.

### Stripe verification

- Use Stripe test mode for successful, failed, canceled, and repeated webhook scenarios.
- Verify webhook signatures and idempotency.
- Confirm subscription cancellation and plan changes synchronize correctly.
- Test Stripe Connect onboarding and payment flows with test connected accounts before advertising the feature.

## Launch Criteria

Phase 1 is ready to publish when the responsive design is approved, all concept work is labeled honestly, the production build passes, the contact path works, accessibility checks pass, and the Cloudflare Pages deployment succeeds. Dashboard and Stripe features remain separate launch gates and must not be presented as active until their own verification criteria pass.
