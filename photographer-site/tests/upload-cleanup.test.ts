import { unlink } from 'node:fs/promises';

import type { DataClient } from '@leon/platform-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sweepOrphanedUploads } from '../src/lib/upload-cleanup';

vi.mock('node:fs/promises', () => ({ unlink: vi.fn() }));

const workspaceId = 'workspace-1';
const uploadRoot = '/srv/uploads';
const unlinkMock = vi.mocked(unlink);

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
    unlinkMock.mockReset();
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

    await sweepOrphanedUploads(client, workspaceId, uploadRoot);

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
    unlinkMock.mockImplementation(async (absolutePath) => {
      const path = String(absolutePath);
      if (path.endsWith('/denied.webp')) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }
      if (path.endsWith('/missing.webp')) {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      }
    });

    await sweepOrphanedUploads(client, workspaceId, uploadRoot);

    expect(releaseWorkspaceUpload).not.toHaveBeenCalledWith(workspaceId, deniedPath);
    expect(releaseWorkspaceUpload).toHaveBeenCalledWith(workspaceId, releaseFailedPath);
    expect(releaseWorkspaceUpload).toHaveBeenCalledWith(workspaceId, missingPath);
    expect(errorSpy).toHaveBeenCalledWith('Orphan upload cleanup failed.', {
      operation: 'unlink',
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
