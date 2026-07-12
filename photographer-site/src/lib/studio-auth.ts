const protectedPrefixes = ['/admin', '/sign-in', '/sign-up', '/api/admin', '/api/connect', '/api/invoices'];

const matchesBoundary = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export const requiresStudioAuth = (pathname: string) =>
  protectedPrefixes.some((prefix) => matchesBoundary(pathname, prefix));
