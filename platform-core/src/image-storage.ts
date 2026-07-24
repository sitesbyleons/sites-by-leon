import path from 'node:path';

export type ImageExtension = 'jpg' | 'png' | 'webp' | 'avif';

const matches = (bytes: Uint8Array, expected: number[], offset = 0) =>
  expected.every((value, index) => bytes[offset + index] === value);

export function detectImageExtension(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length >= 3 && matches(bytes, [0xff, 0xd8, 0xff])) return 'jpg';
  if (bytes.length >= 8 && matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (bytes.length >= 12 && matches(bytes, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (bytes.length >= 12) {
    const box = new TextDecoder('ascii').decode(bytes.slice(4, 12));
    if (box === 'ftypavif' || box === 'ftypavis') return 'avif';
  }
  return null;
}

export function resolveManagedUpload(root: string, workspaceId: string, managedPath: string) {
  if (!root || !isManagedUploadPath(workspaceId, managedPath)) return null;
  const segments = managedPath.split('/');
  const workspaceRoot = path.resolve(root, workspaceId);
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(workspaceRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return candidate;
}

export function isManagedUploadPath(workspaceId: string, managedPath: string) {
  if (!workspaceId || !managedPath || managedPath.includes('\\') || managedPath.length > 512) return false;
  const segments = managedPath.split('/');
  return segments[0] === workspaceId
    && segments.length >= 3
    && segments.every((segment) =>
      Boolean(segment)
      && segment !== '.'
      && segment !== '..'
      && /^[A-Za-z0-9._-]+$/.test(segment));
}
