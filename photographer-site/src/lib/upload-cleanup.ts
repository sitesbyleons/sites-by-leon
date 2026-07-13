import { unlink } from 'node:fs/promises';

import type { DataClient } from '@leon/platform-core';
import { resolveManagedUpload } from '@leon/platform-core/image-storage';

export async function sweepOrphanedUploads(
  client: DataClient,
  workspaceId: string,
  uploadRoot: string,
  minimumAgeMs = 15 * 60 * 1000,
) {
  const pending = await client.findOrphanedWorkspaceUploads(
    workspaceId,
    new Date(Date.now() - minimumAgeMs).toISOString(),
    100,
  );
  if (pending.error) return;

  await Promise.all(pending.data.map(async (row) => {
    const storagePath = typeof row.storage_path === 'string' ? row.storage_path : '';
    const absolute = resolveManagedUpload(uploadRoot, workspaceId, storagePath);
    if (!absolute) return;
    try {
      await unlink(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
    }
    await client.releaseWorkspaceUpload(workspaceId, storagePath);
  }));
}
