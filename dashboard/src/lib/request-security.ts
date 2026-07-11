export function isTrustedOrigin(origin: string | null, expectedOrigin: string) {
  return Boolean(origin && origin === expectedOrigin);
}

export function normalizeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export function shouldBypassClerkForPreview(
  isDevelopment: boolean,
  pathname: string,
  previewValue: string | null,
) {
  return isDevelopment && !pathname.startsWith('/api/') && previewValue === 'true';
}
