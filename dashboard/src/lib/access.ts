export type DashboardAuth = {
  userId: string | null;
  orgId: string | null;
};

export type DashboardAccess =
  | { kind: 'redirect'; location: string }
  | { kind: 'select-organization'; userId: string }
  | { kind: 'workspace'; userId: string; orgId: string };

export type AdminAccess =
  | { kind: 'redirect'; location: string }
  | { kind: 'forbidden'; location: string }
  | { kind: 'admin'; userId: string };

export function decideDashboardAccess(auth: DashboardAuth): DashboardAccess {
  if (!auth.userId) {
    return { kind: 'redirect', location: '/sign-in?redirect_url=%2Fdashboard' };
  }

  if (!auth.orgId) {
    return { kind: 'select-organization', userId: auth.userId };
  }

  return { kind: 'workspace', userId: auth.userId, orgId: auth.orgId };
}

export function decideAdminAccess(input: { userId: string | null; isAdmin: boolean }): AdminAccess {
  if (!input.userId) {
    return { kind: 'redirect', location: '/sign-in?redirect_url=%2Fadmin' };
  }

  if (!input.isAdmin) {
    return { kind: 'forbidden', location: '/dashboard' };
  }

  return { kind: 'admin', userId: input.userId };
}
