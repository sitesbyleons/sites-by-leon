import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('fully self-hosted production stack', () => {
  it('uses plain PostgreSQL and persistent VPS image storage', () => {
    const compose = read('infra/ovh/docker-compose.yml');
    expect(compose).toMatch(/\n  database:\n/);
    expect(compose).toMatch(/image:\s*postgres:17/);
    expect(compose).toContain('/data/uploads');
    expect(compose).not.toMatch(/supabase/i);
  });

  it('routes the coming-soon, test site, and image server separately', () => {
    const caddy = read('infra/ovh/Caddyfile');
    expect(caddy).toMatch(/@marketing host \{\$MARKETING_DOMAIN\} \{\$MARKETING_WWW_DOMAIN\} \{\$TEST_DOMAIN\}/);
    expect(caddy).toMatch(/@test_site host \{\$DEMO_DOMAIN\}/);
    expect(caddy).toContain('handle_path /media/*');
    expect(caddy).toContain('root * /srv/uploads');
  });

  it('defaults public preview deployment hosts to coming soon', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain("'test.leonsites.org'");
    expect(layout).toContain("'localhost'");
    expect(layout).not.toContain("!comingSoonHosts.has(host)");
  });

  it('defines the application schema without Supabase roles or auth functions', () => {
    const schema = read('infra/ovh/postgres/schema.sql');
    for (const table of ['client_workspaces', 'workspace_members', 'connected_payment_account_history', 'studio_galleries', 'studio_gallery_images', 'studio_posts', 'studio_services', 'site_connections']) {
      expect(schema).toContain(`create table if not exists ${table}`);
    }
    expect(schema).not.toMatch(/\b(auth|storage)\./i);
    expect(schema).not.toMatch(/\b(anon|authenticated|service_role)\b/i);
  });

  it('removes Supabase packages from both running applications', () => {
    expect(read('dashboard/package.json')).not.toMatch(/supabase/i);
    expect(read('photographer-site/package.json')).not.toMatch(/supabase/i);
  });

  it('runs Stripe billing inside the self-hosted dashboard instead of proxying a hosted function', () => {
    const checkout = read('dashboard/src/pages/api/billing/checkout.ts');
    const portal = read('dashboard/src/pages/api/billing/portal.ts');
    expect(checkout).toContain("from 'stripe'");
    expect(portal).toContain("from 'stripe'");
    expect(checkout).not.toMatch(/PUBLIC_CHECKOUT_FUNCTION_URL|fetch\(functionUrl/);
    expect(portal).not.toMatch(/PUBLIC_PORTAL_FUNCTION_URL|fetch\(functionUrl/);
  });

  it('runs photographer Stripe Connect and invoice actions inside the VPS application', () => {
    const connect = read('photographer-site/src/pages/api/connect.ts');
    const invoice = read('photographer-site/src/pages/api/invoices/send.ts');
    expect(connect).toContain("from 'stripe'");
    expect(invoice).toContain("from 'stripe'");
    expect(connect).not.toMatch(/PUBLIC_CONNECT_FUNCTION_URL|fetch\(endpoint/);
    expect(invoice).not.toMatch(/PUBLIC_CONNECT_FUNCTION_URL|fetch\(endpoint/);
  });

  it('receives both Stripe webhook streams inside the VPS applications', () => {
    const billingWebhook = read('dashboard/src/pages/api/webhooks/stripe.ts');
    const connectWebhook = read('photographer-site/src/pages/api/webhooks/stripe-connect.ts');
    expect(billingWebhook).toContain('constructEventAsync');
    expect(connectWebhook).toContain('constructEventAsync');
    expect(billingWebhook).not.toMatch(/supabase/i);
    expect(connectWebhook).not.toMatch(/supabase/i);
  });

  it('runs health checks without loading a mutable release Compose file as root', () => {
    const healthcheck = read('infra/ovh/scripts/healthcheck.sh');
    expect(healthcheck).toContain('com.docker.compose.project=${COMPOSE_PROJECT_NAME}');
    expect(healthcheck).toContain('com.docker.compose.service=database');
    expect(healthcheck).toContain('docker exec "${database_container}"');
    expect(healthcheck).toContain('--connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}"');
    expect(healthcheck).toContain('--max-time "${CURL_MAX_TIME_SECONDS}"');
    expect(healthcheck).not.toContain('docker compose');
  });

  it('uses the application origin guard instead of Astro proxy-unaware form checks', () => {
    for (const config of ['dashboard/astro.config.mjs', 'photographer-site/astro.config.mjs']) {
      expect(read(config)).toContain('checkOrigin: false');
    }
    expect(read('platform-core/src/request-security.ts')).toContain("supplied.protocol === 'https:' && internal.protocol === 'http:'");
  });

  it('documents the contact-data salt required by the production inquiry endpoint', () => {
    expect(read('infra/ovh/secrets/northline.env.example')).toMatch(/^CONTACT_HASH_SALT=replace_with_a_random_secret$/m);
    expect(read('photographer-site/.env.example')).toMatch(/^CONTACT_HASH_SALT=replace_with_a_random_secret$/m);
  });
});
