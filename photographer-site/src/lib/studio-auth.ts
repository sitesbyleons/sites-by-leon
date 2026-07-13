const protectedPrefixes = ['/admin', '/sign-in', '/sign-up', '/api/admin', '/api/connect', '/api/invoices'];

const matchesBoundary = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const requiresStudioAuth = (pathname: string) =>
  protectedPrefixes.some((prefix) => matchesBoundary(pathname, prefix));

export const normalizeStudioReturnPath = (value: string | null | undefined) => {
  if (!value || /[\\\u0000-\u001f\u007f]/.test(value)) return '/admin';
  const isAdminPath = value === '/admin'
    || value.startsWith('/admin/')
    || value.startsWith('/admin?')
    || value.startsWith('/admin#');
  return isAdminPath ? value : '/admin';
};
