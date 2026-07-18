import { unlink } from 'node:fs/promises';

import type { DataClient } from '@leon/platform-core';
import { resolveManagedUpload } from '@leon/platform-core/image-storage';

type CleanupOperation = 'scan' | 'validate-path' | 'unlink' | 'release';

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
  uploadRoot: string,
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

  await Promise.all(pending.data.map(async (row) => {
    const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';
    const absolute = resolveManagedUpload(uploadRoot, workspaceId, storagePath);
    if (!absolute) {
      reportCleanupFailure('validate-path', workspaceId, 'Invalid managed upload path.', storagePath);
      return;
    }
    try {
      await unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        reportCleanupFailure('unlink', workspaceId, error, storagePath);
        return;
      }
    }
    try {
      const released = await client.releaseWorkspaceUpload(workspaceId, storagePath);
      if (released.error) reportCleanupFailure('release', workspaceId, released.error, storagePath);
    } catch (error) {
      reportCleanupFailure('release', workspaceId, error, storagePath);
    }
  }));
}
