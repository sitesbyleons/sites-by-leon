import type { DataClient } from '@leon/platform-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sweepOrphanedUploads } from '../src/lib/upload-cleanup';

const workspaceId = 'workspace-1';
const removeMock = vi.fn();
const storage = { remove: removeMock };

function dataClient(
  findOrphanedWorkspaceUploads: ReturnType<typeof vi.fn>,
  releaseWorkspaceUpload = vi.fn().mockResolvedValue({ data: [], error: null }),
) {
  return {
    client: {
      findOrphanedWorkspaceUploads,
      releaseWorkspaceUpload,
    } as unknown as DataClient,
    releaseWorkspaceUpload,
  };
}

describe('orphan upload cleanup', () => {
  beforeEach(() => {
    removeMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a failed orphan scan with its workspace context', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = dataClient(vi.fn().mockResolvedValue({
      data: [],
      error: { message: 'database unavailable' },
    }));

    await sweepOrphanedUploads(client, workspaceId, storage);

    expect(errorSpy).toHaveBeenCalledWith('Orphan upload cleanup failed.', {
      operation: 'scan',
      workspaceId,
      error: 'database unavailable',
    });
  });

  it('reports per-file failures and continues sweeping the remaining uploads', async () => {
    const deniedPath = `${workspaceId}/galleries/denied.webp`;
    const releaseFailedPath = `${workspaceId}/galleries/release-failed.webp`;
    const missingPath = `${workspaceId}/galleries/missing.webp`;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client, releaseWorkspaceUpload } = dataClient(
      vi.fn().mockResolvedValue({
        data: [
          { storage_path: deniedPath },
          { storage_path: releaseFailedPath },
          { storage_path: missingPath },
        ],
        error: null,
      }),
      vi.fn().mockImplementation(async (_workspaceId: string, storagePath: string) => (
        storagePath === releaseFailedPath
          ? { data: [], error: { message: 'release failed' } }
          : { data: [], error: null }
      )),
    );
    removeMock.mockImplementation(async (_workspaceId, storagePath) => {
      if (storagePath === deniedPath) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
    });

    await sweepOrphanedUploads(client, workspaceId, storage);

    expect(releaseWorkspaceUpload).not.toHaveBeenCalledWith(workspaceId, deniedPath);
    expect(releaseWorkspaceUpload).toHaveBeenCalledWith(workspaceId, releaseFailedPath);
    expect(releaseWorkspaceUpload).toHaveBeenCalledWith(workspaceId, missingPath);
    expect(errorSpy).toHaveBeenCalledWith('Orphan upload cleanup failed.', {
      operation: 'remove',
      workspaceId,
      storagePath: deniedPath,
      error: 'permission denied',
    });
    expect(errorSpy).toHaveBeenCalledWith('Orphan upload cleanup failed.', {
      operation: 'release',
      workspaceId,
      storagePath: releaseFailedPath,
      error: 'release failed',
    });
  });
});
