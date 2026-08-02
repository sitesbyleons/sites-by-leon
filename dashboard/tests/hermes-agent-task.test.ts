import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HERMES_REDIRECT_URL,
  HERMES_SESSION_SECONDS,
  HERMES_TEST_ADMIN_DOMAIN,
  HERMES_TEST_EMAIL,
  hermesAgentTaskInput,
  validateHermesEnvironment,
} from '../scripts/create-hermes-agent-task.mjs';

const validEnvironment = {
  CLERK_SECRET_KEY: 'sk_live_test-only-value',
  DATABASE_URL: 'postgresql://test:test@database-test/test',
  DEPLOYMENT_ENVIRONMENT: 'staging',
};

describe('Hermes Agent Task launcher', () => {
  it('is pinned to one synthetic user, test tenant, redirect, and short session', () => {
    expect(HERMES_TEST_EMAIL).toBe('testagentleonsites@agentmail.to');
    expect(HERMES_TEST_ADMIN_DOMAIN).toBe('leon-tech-fan-test.leonsites.org');
    expect(HERMES_REDIRECT_URL).toBe('https://test.leonsites.org/dashboard');
    expect(HERMES_SESSION_SECONDS).toBe(900);
    expect(hermesAgentTaskInput('user_hermes123')).toEqual({
      onBehalfOf: { userId: 'user_hermes123' },
      permissions: '*',
      agentName: 'hermes-customer-simulator',
      taskDescription: 'Authorized Sites By Leon test-tenant customer experience run',
      redirectUrl: HERMES_REDIRECT_URL,
      sessionMaxDurationInSeconds: 900,
    });
  });

  it('refuses non-staging execution and invalid secrets or database URLs', () => {
    expect(() => validateHermesEnvironment(validEnvironment)).not.toThrow();
    expect(() => validateHermesEnvironment({ ...validEnvironment, DEPLOYMENT_ENVIRONMENT: 'production' }))
      .toThrow(/isolated staging dashboard/);
    expect(() => validateHermesEnvironment({ ...validEnvironment, CLERK_SECRET_KEY: 'bad' }))
      .toThrow(/CLERK_SECRET_KEY is invalid/);
    expect(() => validateHermesEnvironment({ ...validEnvironment, DATABASE_URL: 'https://example.com' }))
      .toThrow(/must use PostgreSQL/);
  });

  it('packages the launcher only in the dashboard image and selects the test service', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const dockerfile = fs.readFileSync(path.join(root, 'infra/ovh/docker/Dockerfile.dashboard'), 'utf8');
    const wrapper = fs.readFileSync(path.join(root, 'infra/ovh/scripts/create-hermes-session.sh'), 'utf8');

    expect(dockerfile).toContain('/workspace/dashboard/scripts ./dashboard/scripts');
    expect(wrapper).toContain('com.docker.compose.project=leon-platform-test');
    expect(wrapper).toContain('com.docker.compose.service=dashboard-test');
    expect(wrapper).not.toContain('leon-platform-dashboard-1');
  });
});
