import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('production customer acceptance smoke test', () => {
  it('uses an exact HTTPS tenant origin and one private auth file without exposing its value', () => {
    const script = read('infra/ovh/scripts/customer-acceptance-smoke.sh');

    expect(script).toContain("^https://([^/:?#]+)$");
    expect(script).toContain('require_private_auth_file');
    expect(script).toContain("owner=$(stat -c '%u'");
    expect(script).toContain('$((8#${mode} & 077))');
    expect(script).toContain('auth_options+=(--cookie "${CLERK_COOKIE_JAR}")');
    expect(script).toContain('auth_options+=(--header "@${CLERK_AUTH_HEADER_FILE}")');
    expect(script).toContain("grep -q $'\\t__session\\t'");
    expect(script).toContain('Set either CLERK_COOKIE_JAR or CLERK_AUTH_HEADER_FILE, never both.');
    expect(script).toContain('^Authorization: Bearer [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$');
    expect(script).not.toMatch(/(?:Cookie|Authorization):\s*\$\{/);
    expect(script).not.toContain('set -x');
    expect(script).not.toContain('--verbose');
    expect(script).not.toContain('--location');
  });

  it('refuses mutations until health, owner auth, and disconnected Stripe checks pass', () => {
    const script = read('infra/ovh/scripts/customer-acceptance-smoke.sh');
    const health = script.indexOf("http_request GET '/api/health'");
    const owner = script.indexOf("http_request GET '/admin'");
    const stripe = script.indexOf("json_request POST '/api/connect'");
    const firstUpload = script.indexOf("http_request POST '/api/admin/upload'");

    expect(health).toBeGreaterThan(-1);
    expect(owner).toBeGreaterThan(health);
    expect(stripe).toBeGreaterThan(owner);
    expect(firstUpload).toBeGreaterThan(stripe);
    expect(script).toContain('.charges_enabled == false and .payouts_enabled == false');
    expect(script).toContain('refusing to run a disconnected-payment smoke test');
  });

  it('exercises authenticated CRUD and verifies the disconnected invoice-send guard', () => {
    const script = read('infra/ovh/scripts/customer-acceptance-smoke.sh');

    for (const resource of ['galleries', 'posts', 'services', 'clients', 'invoices']) {
      expect(script).toContain(`'/api/admin/${resource}'`);
      expect(script).toContain(`delete_resource ${resource}`);
    }
    for (const page of ['/admin/galleries', '/admin/posts', '/admin/services', '/admin/clients', '/admin/invoices']) {
      expect(script).toContain(`'${page}'`);
    }
    expect(script).toContain('require_json_id');
    expect(script).toContain("json_request POST '/api/invoices/send'");
    expect(script).toContain('[[ ${HTTP_STATUS} != 409 ]]');
    expect(script).toContain('.message == "Finish Stripe onboarding first."');
  });

  it('cleans every temporary resource in reverse dependency order on exit', () => {
    const script = read('infra/ovh/scripts/customer-acceptance-smoke.sh');
    const cleanup = script.slice(script.indexOf('cleanup() {'), script.indexOf('trap cleanup EXIT'));
    const invoice = cleanup.indexOf('delete_resource invoices');
    const client = cleanup.indexOf('delete_resource clients');
    const service = cleanup.indexOf('delete_resource services');
    const post = cleanup.indexOf('delete_resource posts');
    const gallery = cleanup.indexOf('delete_resource galleries');

    expect(invoice).toBeGreaterThan(-1);
    expect(client).toBeGreaterThan(invoice);
    expect(service).toBeGreaterThan(client);
    expect(post).toBeGreaterThan(service);
    expect(gallery).toBeGreaterThan(post);
    expect(cleanup).toContain('delete_upload "${post_upload_path}" post');
    expect(cleanup).toContain('delete_upload "${gallery_upload_path}" gallery');
    expect(cleanup).toContain('admin_page_omits');
    expect(script).toContain('trap cleanup EXIT');
    expect(script).toContain("trap 'exit 130' INT");
    expect(script).toContain("trap 'exit 143' TERM");
  });

  it('documents secure operator use and the disconnected-studio limit', () => {
    const runbook = read('docs/operations/client-provisioning.md');

    expect(runbook).toContain('customer-acceptance-smoke.sh');
    expect(runbook).toContain('CLERK_COOKIE_JAR');
    expect(runbook).toContain('CLERK_AUTH_HEADER_FILE');
    expect(runbook).toContain('chmod 600');
    expect(runbook).toContain('Stripe is disconnected');
    expect(runbook).toContain('temporary resources');
  });
});
