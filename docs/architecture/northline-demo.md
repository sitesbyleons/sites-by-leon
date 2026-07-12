# Northline Portrait Studio demo deployment

Northline is a fictional photographer-site production demo owned and operated by Sites By Leon. It is intentionally isolated from the Sites By Leon marketing application so it follows the same deployment shape as a future client site.

## Source control

- GitHub repository: `sitesbyleons/northline-portraits-demo`
- Repository visibility: private
- Repository ID: `1297157560`
- Production branch: `main`
- Application root: `/`
- Current production source commit: `7f9327d999e64d1812f89f024c9c42177981bf1f`

The repository is connected directly to Vercel. A fast-forward push to `main` creates a production deployment. No client-owned GitHub account is required for this demo.

## Vercel

- Team: `sitesbyleons' projects`
- Team ID: `team_WJPOfpXpWR1UGEo2tBaCiTB5`
- Project: `northline-portraits-demo`
- Project ID: `prj_AWIrVXuJKzndtFWgy60ok5iQwMqI`
- Framework: Astro
- Root directory: `./`
- Install command: Vercel's detected pnpm install
- Build command: Vercel's detected Astro build
- Production URL: <https://northline-portraits-demo.vercel.app>
- Current production deployment: `dpl_9fo9y6chGr3Kfu2j1NqDRdxT9yiW`

The project is deliberately hosted on the Sites By Leon Vercel team. A custom client domain can be attached later without transferring project ownership.

The repository includes its own `pnpm-lock.yaml` and pnpm 11 workspace settings, so it installs independently when checked out as a repository root. Dependency build scripts are explicitly limited to `esbuild` and `sharp`, the two packages required by Astro's build and image pipeline.

## Control-plane boundary

The deployment has a unique `LEON_SITE_ID` configured in Vercel. Its value is intentionally not recorded in source control.

The following integrations remain disconnected until a real control plane is available:

- `LEON_CONTROL_URL`
- `LEON_SITE_SECRET`
- production DNS for a custom client domain

This means the public demo cannot be remotely paused by an untrusted browser value, and it does not expose a shared control-plane credential. The `/api/health` route exposes only public service state and version metadata.

## Verification

The release was checked with Astro diagnostics, 21 unit tests, a production build, and 23 Playwright tests at desktop and iPhone widths. The automated browser suite covers route responses, horizontal overflow, serious accessibility issues, public pause boundaries, package/contact behavior, invoice placeholders, and gallery/journal fixtures.

The standalone repository includes `.github/workflows/quality.yml`. GitHub Actions run `29160849739` completed successfully for the production source commit. Its `verify` job used pnpm 11.7.0 with a frozen lockfile and passed Astro checking, unit tests, the production build, and Chromium browser/accessibility/mobile coverage.

Live verification covers `/`, `/work`, a work detail, `/journal`, a journal detail, `/packages`, `/contact`, `/invoice/demo`, and `/api/health`.

Every live HTML route uses `https://northline-portraits-demo.vercel.app` for canonical metadata. Routes with an Open Graph image use that same production origin. Live Chromium verification confirmed the four repository-driven homepage fields, desktop and iPhone overflow and accessibility checks, and twelve unique captioned gallery frames. Chrome was also used to confirm the successful production workflow after the deployment reached `READY`.
