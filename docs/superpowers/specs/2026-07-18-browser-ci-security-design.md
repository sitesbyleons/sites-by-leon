# Browser And CI Security Repair Design

**Status:** Approved through the owner's blanket authorization to fix the audited issues.

## Purpose

Remove broad inline-script execution from browser policy and make the CI dependency boundary reproducible without disrupting Clerk or Astro hydration.

## Content Security Policy

Astro's stable CSP support will generate hashes for processed and server-rendered inline scripts in the marketing, dashboard, and photographer builds. Each application defines its complete resource policy in `astro.config.mjs`, including Clerk, Cloudflare challenge/analytics, media, image, connection, frame, font, and worker sources.

`script-src` will not contain `'unsafe-inline'`. Astro-generated hashes authorize only the exact inline bootstrap and component scripts emitted for a response. `style-src 'unsafe-inline'` remains because managed theme custom properties, progress widths, image crop controls, and Clerk's runtime CSS require inline styles; this exception is deliberately limited to styles.

Caddy retains transport and embedding controls that must be delivered as HTTP headers, including HSTS, `frame-ancestors`, `base-uri`, and `object-src`. It does not add a second broad script policy that conflicts with Astro's generated hashes. Media and non-HTML responses continue to receive the common hardening headers.

Verification inspects built static HTML and rendered SSR pages, confirms there is no `script-src 'unsafe-inline'`, then exercises marketing motion, Clerk sign-in, dashboard controls, photographer admin controls, and React-powered public components in Chromium while treating CSP console violations as test failures.

## CI Supply Chain And Secret Scope

Every third-party GitHub Action is pinned to a full commit SHA with its release tag retained in a comment for maintainability. The initial pins are resolved directly from the official action repositories.

Clerk secrets are removed from job-wide environment scope. Only build or browser-test steps that actually require Clerk receive those values. Database URLs remain job-scoped because the integration suite uses them throughout and they are ephemeral service credentials, not production secrets.

CI tests assert that action references are full SHAs and that Clerk secrets are absent from the job-level environment. Existing least-privilege workflow permissions remain `contents: read`.

## Acceptance Criteria

- All three production builds contain strict script policies with hashes and no script inline wildcard.
- Browser tests complete with no CSP errors on public, auth, dashboard, or studio routes.
- The workflow contains no mutable `uses: owner/action@vN` references.
- Forked pull requests can run non-Clerk checks without receiving Clerk secrets.
- Unit, integration, build, browser, infrastructure, and dependency-audit gates all pass before deployment.

