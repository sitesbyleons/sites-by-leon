export { isTrustedOrigin, resolveTrustedOrigin } from '@leon/platform-core/request-security';

export function normalizeReturnPath(value: string | null | undefined) {
  if (!value || /[\\\u0000-\u001f\u007f]/.test(value)) return '/dashboard';
  const isAllowed = ['/dashboard', '/admin'].some((base) =>
    value === base
    || value.startsWith(`${base}/`)
    || value.startsWith(`${base}?`)
    || value.startsWith(`${base}#`));
  return isAllowed ? value : '/dashboard';
}

export function shouldBypassClerkForPreview(
  isDevelopment: boolean,
  pathname: string,
  previewValue: string | null,
) {
  return isDevelopment && !pathname.startsWith('/api/') && previewValue === 'true';
}
