export type DashboardAuth = {
  userId: string | null;
  orgId: string | null;
};

export type DashboardAccess =
  | { kind: 'redirect'; location: string }
  | { kind: 'select-organization'; userId: string }
  | { kind: 'workspace'; userId: string; orgId: string };

export function decideDashboardAccess(auth: DashboardAuth): DashboardAccess {
  if (!auth.userId) {
    return { kind: 'redirect', location: '/sign-in?redirect_url=%2Fdashboard' };
  }

  if (!auth.orgId) {
    return { kind: 'select-organization', userId: auth.userId };
  }

  return { kind: 'workspace', userId: auth.userId, orgId: auth.orgId };
}
