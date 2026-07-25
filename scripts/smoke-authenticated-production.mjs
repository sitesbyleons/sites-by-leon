import { clerk } from '@clerk/testing/playwright';
import { chromium } from '@playwright/test';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const publishableKey = required('CLERK_PUBLISHABLE_KEY');
required('CLERK_SECRET_KEY');
const ownerEmail = required('E2E_CLERK_USER_EMAIL');
const encodedFrontendApi = publishableKey.replace(/^pk_(?:live|test)_/, '');
const frontendApiUrl = Buffer.from(encodedFrontendApi, 'base64').toString('utf8').replace(/\$$/, '');
if (!/^[a-z0-9.-]+$/i.test(frontendApiUrl)) throw new Error('CLERK_PUBLISHABLE_KEY is invalid.');
const origin = 'https://leonsites.org';
const routes = [
  ['/admin', 'Overview'],
  ['/admin/sites', 'Sites'],
  ['/admin/demos', 'Demos'],
  ['/admin/subscriptions', 'Subscriptions'],
  ['/admin/tickets', 'Tickets'],
  ['/admin/users', 'Users'],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const results = [];
let stage = 'open sign-in';

const safeError = (error) => {
  const message = error instanceof Error ? error.message : 'Unknown failure';
  return message
    .replace(/(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '[redacted-token]')
    .replace(/[?&](?:__clerk_ticket|__clerk_testing_token)=[^&\s]+/g, '[redacted-query]')
    .slice(0, 500);
};

try {
  await page.goto(`${origin}/sign-in`, { waitUntil: 'domcontentloaded' });
  stage = 'Clerk sign-in';
  await clerk.signIn({
    page,
    emailAddress: ownerEmail,
    setupClerkTestingTokenOptions: { frontendApiUrl },
  });

  for (const [path, expectedHeading] of routes) {
    stage = `verify ${path}`;
    const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
    const heading = (await page.locator('h1').first().textContent({ timeout: 10_000 }))?.trim();
    const finalUrl = new URL(page.url());
    const passed = response?.status() === 200
      && finalUrl.origin === origin
      && finalUrl.pathname === path
      && heading === expectedHeading;
    results.push({ path, status: response?.status() ?? null, heading: heading ?? null, passed });
  }
} catch (error) {
  console.error(`Authenticated production smoke failed during ${stage}: ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}

if (results.length !== routes.length || results.some((result) => !result.passed)) {
  console.error(JSON.stringify({ authenticated: false, routes: results }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ authenticated: true, routes: results }, null, 2));
}
