import { describe, expect, it } from 'vitest';

import { normalizeDashboardState } from '../src/lib/dashboard-state';

describe('normalizeDashboardState', () => {
  it('shows a guided onboarding state when the Clerk organization has no workspace yet', () => {
    expect(normalizeDashboardState({ workspace: null, project: null, subscription: null })).toEqual({
      mode: 'onboarding',
      workspaceName: 'Your studio',
      planName: null,
      billingTone: 'neutral',
      projectStatus: 'Getting started',
      progress: 0,
      nextStep: 'Leon will connect this workspace after your first conversation.',
    });
  });

  it('normalizes an active project and subscription for display', () => {
    expect(
      normalizeDashboardState({
        workspace: { name: 'Northline Portraits' },
        project: { status: 'review', progress: 130, next_step: 'Approve the mobile gallery.' },
        subscription: { plan_key: 'studio', status: 'active' },
      }),
    ).toEqual({
      mode: 'active',
      workspaceName: 'Northline Portraits',
      planName: 'Studio',
      billingTone: 'positive',
      projectStatus: 'In review',
      progress: 100,
      nextStep: 'Approve the mobile gallery.',
    });
  });

  it('surfaces past-due billing without hiding the project', () => {
    expect(
      normalizeDashboardState({
        workspace: { name: 'Vow & Light' },
        project: { status: 'live', progress: 100, next_step: null },
        subscription: { plan_key: 'signature', status: 'past_due' },
      }),
    ).toMatchObject({
      mode: 'active',
      billingTone: 'attention',
      projectStatus: 'Live',
      nextStep: 'Update your billing details to keep managed hosting active.',
    });
  });
});
