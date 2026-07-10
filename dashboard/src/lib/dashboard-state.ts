import { getPlan } from './billing';

type WorkspaceRecord = { name: string };
type ProjectRecord = { status: string; progress: number; next_step: string | null };
type SubscriptionRecord = { plan_key: string; status: string };

type DashboardRecords = {
  workspace: WorkspaceRecord | null;
  project: ProjectRecord | null;
  subscription: SubscriptionRecord | null;
};

const projectLabels: Record<string, string> = {
  onboarding: 'Getting started',
  design: 'In design',
  review: 'In review',
  live: 'Live',
  paused: 'Paused',
};

export function normalizeDashboardState(records: DashboardRecords) {
  if (!records.workspace) {
    return {
      mode: 'onboarding' as const,
      workspaceName: 'Your studio',
      planName: null,
      billingTone: 'neutral' as const,
      projectStatus: 'Getting started',
      progress: 0,
      nextStep: 'Leon will connect this workspace after your first conversation.',
    };
  }

  const plan = records.subscription ? getPlan(records.subscription.plan_key) : null;
  const pastDue = records.subscription?.status === 'past_due';
  const progress = Math.max(0, Math.min(100, records.project?.progress ?? 0));

  return {
    mode: 'active' as const,
    workspaceName: records.workspace.name,
    planName: plan?.name ?? null,
    billingTone: pastDue ? ('attention' as const) : ('positive' as const),
    projectStatus: projectLabels[records.project?.status ?? 'onboarding'] ?? 'Getting started',
    progress,
    nextStep: pastDue
      ? 'Update your billing details to keep managed hosting active.'
      : records.project?.next_step ?? 'Everything is current. Leon will post the next update here.',
  };
}
