import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readWorkspace = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('studio resource mutations', () => {
  it('reports a missing edit so the browser can remove its unclaimed upload', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    expect(route).toContain('if (!result.data.length)');
    expect(route).toContain("status: 404");
  });

  it('does not turn a committed image edit into a client-side rollback when old-file cleanup fails', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    const layout = read('src/layouts/StudioAdminLayout.astro');
    expect(route).toContain('removeFiles(client, workspaceId');
    expect(route).toContain('.catch(() => null)');
    expect(layout).toContain('definiteRejection');
    expect(layout).toContain('response.status < 500');
    expect(layout).toContain('pendingUploadSignature');
  });

  it('uses serialized database helpers for ordering instead of two independent updates', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    expect(route).toContain('client.moveOrderedItem');
    expect(route).toContain('client.insertOrdered');
    expect(route).not.toContain('const first = await client.from(table).update');
  });

  it('reserves per-workspace storage before writing an uploaded image', () => {
    const upload = read('src/pages/api/admin/upload.ts');
    expect(upload).toContain('optimizeUploadedImage');
    expect(upload).toContain('claimWorkspaceUpload');
    expect(upload).toContain('releaseWorkspaceUpload');
    expect(upload).toContain('WORKSPACE_UPLOAD_QUOTA_BYTES');
    expect(upload).toContain('sweepOrphanedUploads');
    expect(upload).toContain('}.webp`');
    expect(upload).toContain('claimWorkspaceUpload(workspaceId, managedPath, optimized.bytes.byteLength');
    expect(upload).toContain('writeFile(absolute, optimized.bytes');
  });

  it('does not remove an upload after it has been attached to studio content', () => {
    const upload = read('src/pages/api/admin/upload.ts');
    const referenceCheck = upload.indexOf('isWorkspaceUploadReferenced');
    const unlink = upload.indexOf('await unlink');

    expect(referenceCheck).toBeGreaterThan(-1);
    expect(referenceCheck).toBeLessThan(unlink);
    expect(upload).toContain('if (reference.data)');
  });

  it('deduplicates upload-backed creates and recovers a concurrent insert race', () => {
    const route = read('src/pages/api/admin/[resource].ts');

    expect(route).toContain("table: 'studio_galleries', pathColumn: 'cover_storage_path'");
    expect(route).toContain("table: 'studio_gallery_images', pathColumn: 'storage_path'");
    expect(route).toContain("table: 'studio_posts', pathColumn: 'cover_storage_path'");
    expect(route).toContain('findUploadBackedResource');
    expect(route).toMatch(/duplicate key|unique constraint/i);
  });

  it('enforces one studio record per workspace upload path', () => {
    const schema = readWorkspace('infra/ovh/postgres/schema.sql');

    expect(schema).toMatch(/create unique index[^;]+studio_galleries[^;]+\(workspace_id, cover_storage_path\)[^;]+where cover_storage_path is not null/i);
    expect(schema).toMatch(/create unique index[^;]+studio_gallery_images[^;]+\(workspace_id, storage_path\)[^;]+where storage_path is not null/i);
    expect(schema).toMatch(/create unique index[^;]+studio_posts[^;]+\(workspace_id, cover_storage_path\)[^;]+where cover_storage_path is not null/i);
  });
});
