export type DashboardAuth = {
  userId: string | null;
  orgId: string | null;
};

export type DashboardAccess =
  | { kind: 'redirect'; location: string }
  | { kind: 'account'; userId: string; orgId: string | null };

export type AdminAccess =
  | { kind: 'redirect'; location: string }
  | { kind: 'forbidden'; location: string }
  | { kind: 'admin'; userId: string };

export function decideDashboardAccess(auth: DashboardAuth): DashboardAccess {
  if (!auth.userId) {
    return { kind: 'redirect', location: '/sign-in?redirect_url=%2Fdashboard' };
  }

  return { kind: 'account', userId: auth.userId, orgId: auth.orgId };
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
