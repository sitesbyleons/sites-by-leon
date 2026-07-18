export function resolvePublishedAt(
  currentPublishedAt: string | null,
  nextStatus: 'draft' | 'published',
  now = new Date().toISOString(),
) {
  if (nextStatus === 'draft') return null;
  return currentPublishedAt ?? now;
}
