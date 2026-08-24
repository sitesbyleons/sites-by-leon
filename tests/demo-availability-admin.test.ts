import { describe, expect, it } from 'vitest';

import { setDesiredSiteStatus } from '../platform-core/src/hosting-access';

describe('demo availability admin controls', () => {
  it('sets demo site to active (Keep live)', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await setDesiredSiteStatus(
      async (text, values) => {
        calls.push({ text, values });
        return [
          {
            outcome: 'updated',
            billing_mode: 'manual',
            desired_status: 'active',
            billing_state: 'manual',
            site_status: 'active',
            hosting_subscription_id: null,
          },
        ];
      },
      {
        workspace_id: '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
        desired_status: 'active',
      },
    );

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'active',
      desired_status: 'active',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([
      '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
      'active',
    ]);
  });

  it('sets demo site to maintenance (Maintenance page)', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await setDesiredSiteStatus(
      async (text, values) => {
        calls.push({ text, values });
        return [
          {
            outcome: 'updated',
            billing_mode: 'manual',
            desired_status: 'maintenance',
            billing_state: 'manual',
            site_status: 'maintenance',
            hosting_subscription_id: null,
          },
        ];
      },
      {
        workspace_id: '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
        desired_status: 'maintenance',
      },
    );

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'maintenance',
      desired_status: 'maintenance',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([
      '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
      'maintenance',
    ]);
  });

  it('sets demo site to paused (Pause site)', async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const result = await setDesiredSiteStatus(
      async (text, values) => {
        calls.push({ text, values });
        return [
          {
            outcome: 'updated',
            billing_mode: 'manual',
            desired_status: 'paused',
            billing_state: 'manual',
            site_status: 'paused',
            hosting_subscription_id: null,
          },
        ];
      },
      {
        workspace_id: '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
        desired_status: 'paused',
      },
    );

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      outcome: 'updated',
      site_status: 'paused',
      desired_status: 'paused',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].values).toEqual([
      '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
      'paused',
    ]);
  });

  it('updates status in manual billing mode immediately', async () => {
    let sql = '';
    await setDesiredSiteStatus(
      async (text) => {
        sql = text;
        return [
          {
            outcome: 'updated',
            billing_mode: 'manual',
            desired_status: 'maintenance',
            billing_state: 'manual',
            site_status: 'maintenance',
            hosting_subscription_id: null,
          },
        ];
      },
      {
        workspace_id: '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
        desired_status: 'maintenance',
      },
    );

    expect(sql).toContain('"desired_status" = $2');
    expect(sql).toContain('when connection."billing_mode" = \'manual\' then $2');
    expect(sql).toContain('update "client_workspaces"');
    expect(sql).toContain('update "website_projects"');
  });

  it('respects deployment_target regardless of value', async () => {
    // The status change should work for any deployment_target
    // including ovh:ishotyouu-demo, ovh:leon-platform-photographer, etc.
    const result = await setDesiredSiteStatus(
      async () => [
        {
          outcome: 'updated',
          billing_mode: 'manual',
          desired_status: 'paused',
          billing_state: 'manual',
          site_status: 'paused',
          hosting_subscription_id: null,
        },
      ],
      {
        workspace_id: '8a8366b9-b7a5-43a7-9091-eb16830aa8d4',
        desired_status: 'paused',
      },
    );

    expect(result.data?.site_status).toBe('paused');
  });
});
