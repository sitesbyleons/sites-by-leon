import type { DataClient } from '@leon/platform-core';
import { isManagedUploadPath } from '@leon/platform-core/image-storage';

type CleanupOperation = 'scan' | 'validate-path' | 'remove' | 'release';
type UploadStorage = { remove(workspaceId: string, managedPath: string): Promise<void> };

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unknown cleanup error.';
}

function reportCleanupFailure(
  operation: CleanupOperation,
  workspaceId: string,
  error: unknown,
  storagePath?: string,
) {
  console.error('Orphan upload cleanup failed.', {
    operation,
    workspaceId,
    ...(storagePath ? { storagePath } : {}),
    error: errorMessage(error),
  });
}

export async function sweepOrphanedUploads(
  client: DataClient,
  workspaceId: string,
  storage: UploadStorage,
  minimumAgeMs = 15 * 60 * 1000,
) {
  let pending;
  try {
    pending = await client.findOrphanedWorkspaceUploads(
      workspaceId,
      new Date(Date.now() - minimumAgeMs).toISOString(),
      100,
    );
  } catch (error) {
    reportCleanupFailure('scan', workspaceId, error);
    return;
  }
  if (pending.error) {
    reportCleanupFailure('scan', workspaceId, pending.error);
    return;
  }

  const rows = pending.data;
  for (let offset = 0; offset < rows.length; offset += 8) {
    await Promise.all(rows.slice(offset, offset + 8).map(async (row) => {
      const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';
      if (!isManagedUploadPath(workspaceId, storagePath)) {
        reportCleanupFailure('validate-path', workspaceId, 'Invalid managed upload path.', storagePath);
        return;
      }
      try {
        await storage.remove(workspaceId, storagePath);
      } catch (error) {
        reportCleanupFailure('remove', workspaceId, error, storagePath);
        return;
      }
      try {
        const released = await client.releaseWorkspaceUpload(workspaceId, storagePath);
        if (released.error) reportCleanupFailure('release', workspaceId, released.error, storagePath);
      } catch (error) {
        reportCleanupFailure('release', workspaceId, error, storagePath);
      }
    }));
  }
}
