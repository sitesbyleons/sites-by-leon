import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('fully self-hosted production stack', () => {
  it('uses plain PostgreSQL and a persistent local fallback for image storage', () => {
    const compose = read('infra/ovh/docker-compose.yml');
    expect(compose).toMatch(/\n  database:\n/);
    expect(compose).toMatch(/image:\s*postgres:17/);
    expect(compose).toContain('/data/uploads');
    expect(compose).not.toMatch(/supabase/i);
  });

  it('routes marketing, media, and every customer host through the shared fail-closed runtime', () => {
    const compose = read('infra/ovh/docker-compose.yml');
    const caddy = read('infra/ovh/Caddyfile');
    const resolver = read('photographer-site/src/lib/site-context.ts');
    const middleware = read('photographer-site/src/middleware.ts');

    expect(caddy).toMatch(/@marketing host \{\$MARKETING_DOMAIN\} \{\$MARKETING_WWW_DOMAIN\}/);
    expect(caddy).toContain('@test host {$TEST_DOMAIN}');
    expect(caddy).toContain('reverse_proxy gateway-test:80');
    expect(caddy).toContain('handle_path /media/*');
    expect(caddy).toContain('rewrite * /api/media{path}');
    expect(caddy).toContain('reverse_proxy photographer:4321');
    expect(caddy).not.toContain('root * /srv/uploads');
    expect(caddy).not.toMatch(/DEMO_DOMAIN|@test_site|reverse_proxy northline:/);
    expect(compose).toMatch(/\n  photographer:\n/);
    expect(compose).not.toMatch(/\n  northline:\n/);

    expect(resolver).toContain(".eq('primary_domain', input.hostname)");
    expect(resolver).toContain(".eq('admin_domain', input.hostname)");
    expect(resolver).toContain("return { context: null, error: 'unknown-host' }");
    expect(resolver).toContain("return { context: null, error: 'unavailable' }");
    expect(resolver).toContain("nodeEnv === 'development' || nodeEnv === 'test'");
    expect(middleware).toContain('sequence(tenantResolution, publicControl, authentication)');
    expect(middleware).toContain("unavailableResponse('Site not found.', 404)");
    expect(middleware).toContain("unavailableResponse('Site temporarily unavailable. Please try again soon.', 503)");
  });

  it('serves a standalone coming-soon document only at the production marketing root', () => {
    const caddy = read('infra/ovh/Caddyfile');
    const fullMarketing = read('src/pages/index.astro');
    const comingSoonUrl = new URL('../src/pages/coming-soon.astro', import.meta.url);
    const comingSoonExists = fs.existsSync(comingSoonUrl);
    const comingSoon = comingSoonExists ? fs.readFileSync(comingSoonUrl, 'utf8') : '';

    expect(comingSoonExists).toBe(true);
    expect(caddy).toMatch(/@coming_soon\s*\{[\s\S]*host \{\$MARKETING_DOMAIN\} \{\$MARKETING_WWW_DOMAIN\}[\s\S]*path \/[\s\S]*\}/);
    expect(caddy).toContain('rewrite * /coming-soon/index.html');
    expect(caddy).toContain('expression {env.PUBLIC_SITE_MODE} == "coming-soon"');
    expect(caddy).toMatch(/@marketing host \{\$MARKETING_DOMAIN\} \{\$MARKETING_WWW_DOMAIN\}/);
    expect(caddy).toContain('@test host {$TEST_DOMAIN}');
    expect(fullMarketing).not.toContain('ComingSoon');
    expect(fullMarketing).not.toContain('hostSwitch');
    expect(comingSoon).toContain('<ComingSoon />');
    expect(comingSoon).not.toMatch(/Hero|ConceptShowcase|Pricing|Services|Contact/);
  });

  it('runs the test hostname on an isolated release and database stack', () => {
    const compose = read('infra/ovh/docker-compose.test.yml');
    const gateway = read('infra/ovh/Caddyfile.test');
    const deploy = read('infra/ovh/scripts/deploy-test.sh');
    const activate = read('infra/ovh/scripts/activate-test-release.sh');
    const configureRole = read('infra/ovh/scripts/configure-test-runtime-role.sh');
    const healthcheck = read('infra/ovh/scripts/healthcheck-test.sh');
    const promote = read('infra/ovh/scripts/promote-tested-release.sh');

    expect(compose).toContain('name: leon-platform-test');
    expect(compose).toMatch(/\n  database-test:\n/);
    expect(compose).toMatch(/\n  dashboard-test:\n/);
    expect(compose).toMatch(/\n  photographer-test:\n/);
    expect(compose).toMatch(/\n  gateway-test:\n/);
    expect(compose).toContain('leon-postgres-test:');
    expect(gateway).toContain('reverse_proxy dashboard-test:4321');
    expect(gateway).toContain('reverse_proxy photographer-test:4321');
    expect(gateway).toContain('@test_customer header_regexp test_customer Host');
    expect(gateway).toContain('-test\\.leonsites\\.org');
    expect(deploy).toContain('/opt/leon-platform/current-test');
    expect(deploy).toContain('configure-test-runtime-role.sh');
    expect(deploy).toContain('verify-media-storage.mjs');
    expect(activate).toContain('current-test.new');
    expect(activate).toContain('automatic rollback protection');
    expect(activate).toContain('flock -u 9');
    expect(configureRole).toContain('leon_test_dashboard');
    expect(configureRole).toContain('grant leon_runtime to leon_test_dashboard');
    expect(configureRole).toContain('grant leon_photographer_runtime to leon_test_photographer');
    expect(healthcheck).toContain('--header="Host: ${TEST_DOMAIN}"');
    expect(promote).toContain('Only the currently deployed staging release can be promoted.');
    expect(promote).toContain('MAINTENANCE_LOCK_HELD=1');
    expect(promote).toContain('/infra/ovh/scripts/deploy.sh');
  });

  it('verifies private object storage before accepting either deployment', () => {
    const productionDeploy = read('infra/ovh/scripts/deploy.sh');
    const stagingDeploy = read('infra/ovh/scripts/deploy-test.sh');
    const verifier = read('photographer-site/scripts/verify-media-storage.mjs');

    expect(productionDeploy).toContain('node ./photographer-site/scripts/verify-media-storage.mjs');
    expect(stagingDeploy).toContain('node ./photographer-site/scripts/verify-media-storage.mjs');
    expect(verifier).toContain('PutObjectCommand');
    expect(verifier).toContain('GetBucketVersioningCommand');
    expect(verifier).toContain('GetObjectCommand');
    expect(verifier).toContain('DeleteObjectCommand');
    expect(verifier).toContain('crypto.timingSafeEqual');
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
    const connectV2Webhook = read('photographer-site/src/pages/api/webhooks/stripe-connect-v2.ts');
    expect(billingWebhook).toContain('constructEventAsync');
    expect(connectWebhook).toContain('constructEventAsync');
    expect(connectV2Webhook).toContain('parseEventNotificationAsync');
    expect(billingWebhook).not.toMatch(/supabase/i);
    expect(connectWebhook).not.toMatch(/supabase/i);
  });

  it('ships a redacted verifier for Stripe prices, Portal, and connected-account destinations', () => {
    const verifierPath = new URL('../infra/ovh/scripts/verify-stripe-config.mjs', import.meta.url);
    expect(fs.existsSync(verifierPath)).toBe(true);
    const verifier = fs.existsSync(verifierPath) ? fs.readFileSync(verifierPath, 'utf8') : '';

    for (const required of [
      'STRIPE_BILLING_PORTAL_CONFIGURATION',
      "'https://leonsites.org'",
      "'https://test.leonsites.org'",
      '/privacy',
      '/terms',
      "events_from",
      "'@accounts'",
      "'@self'",
      "invoice.marked_uncollectible",
      "v2.core.account[configuration.merchant].capability_status_updated",
      'livemode',
      'active',
    ]) {
      expect(verifier).toContain(required);
    }
    expect(verifier).not.toMatch(/console\.(?:log|error)\([^\n]*(?:SECRET_KEY|WEBHOOK_SECRET)/);
  });

  it('ships a credential-free authenticated production smoke harness', () => {
    const smoke = read('scripts/smoke-authenticated-production.mjs');
    const manifest = read('package.json');

    expect(manifest).toContain('smoke:production:auth');
    expect(smoke).toContain('setupClerkTestingTokenOptions: { frontendApiUrl }');
    expect(smoke).toContain("required('CLERK_SECRET_KEY')");
    expect(smoke).toContain("required('CLERK_PUBLISHABLE_KEY')");
    expect(smoke).not.toMatch(/(?:sk|pk)_(?:live|test)_/);
  });

  it('ships an idempotent Stripe resource repair command with atomic secret persistence', () => {
    const configurePath = new URL('../infra/ovh/scripts/configure-stripe-resources.mjs', import.meta.url);
    expect(fs.existsSync(configurePath)).toBe(true);
    const configure = fs.existsSync(configurePath) ? fs.readFileSync(configurePath, 'utf8') : '';

    expect(configure).toContain('stripe.v2.core.eventDestinations.create');
    expect(configure).toContain("events_from: ['other_accounts']");
    expect(configure).toContain("'webhook_endpoint.signing_secret'");
    expect(configure).not.toContain('stripe.webhookEndpoints.create');
    expect(configure).toContain("'@accounts'");
    expect(configure).toContain("'other_accounts'");
    expect(configure).toContain('Complete and activate the Connect platform profile');
    expect(configure).toContain('const secret = created.webhook_endpoint?.signing_secret');
    expect(configure).toContain('STRIPE_BILLING_PORTAL_CONFIGURATION');
    expect(configure).toContain('STRIPE_CONNECT_WEBHOOK_SECRET');
    expect(configure).toContain('renameSync');
    expect(configure).not.toMatch(/console\.(?:log|error)\([^\n]*(?:SECRET_KEY|WEBHOOK_SECRET)/);
  });

  it('health-checks every active customer hostname without loading mutable Compose as root', () => {
    const healthcheck = read('infra/ovh/scripts/healthcheck.sh');
    expect(healthcheck).toContain('com.docker.compose.project=${COMPOSE_PROJECT_NAME}');
    expect(healthcheck).toContain('com.docker.compose.service=database');
    expect(healthcheck).toContain('docker exec "${database_container}"');
    expect(healthcheck).toContain('--connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}"');
    expect(healthcheck).toContain('--max-time "${CURL_MAX_TIME_SECONDS}"');
    expect(healthcheck).toContain('select distinct lower(primary_domain) from site_connections where status =');
    expect(healthcheck).toContain('order by 1;');
    expect(healthcheck).toContain('for domain in "${active_site_domains[@]}"');
    expect(healthcheck).toContain('"https://${domain}/api/health"');
    expect(healthcheck).toContain('Database contains an invalid active site domain.');
    expect(healthcheck).not.toContain('DEMO_URL');
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
