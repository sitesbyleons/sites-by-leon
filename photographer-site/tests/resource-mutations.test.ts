import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readWorkspace = (path: string) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('studio resource mutations', () => {
  it('reports a missing edit so the browser can remove its unclaimed upload', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    expect(route).toContain('if (!result.data.length)');
    expect(route).toContain("status: 404");
    expect(route).toContain("typeof result.data[0]?.id === 'string'");
    expect(route).toContain('{ ok: true, id: resourceId }');
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

  it('returns a conflict when a studio reaches its gallery or image quota', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    const core = readWorkspace('platform-core/src/index.ts');

    expect(core).toContain('studio_galleries: 100');
    expect(core).toContain('studio_gallery_images: 5_000');
    expect(core).toContain('capacity.available');
    expect(route).toContain("quotaLimitedCreate: 'galleries' | 'images' | null");
    expect(route).toContain("status: 409");
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
    expect(upload).toContain('storage.write(workspaceId, managedPath, optimized.bytes');
  });

  it('does not remove an upload after it has been attached to studio content', () => {
    const upload = read('src/pages/api/admin/upload.ts');
    const referenceCheck = upload.indexOf('isWorkspaceUploadReferenced');
    const remove = upload.indexOf('await storage.remove');

    expect(referenceCheck).toBeGreaterThan(-1);
    expect(referenceCheck).toBeLessThan(remove);
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

  it('persists validated gallery layout and image crop controls', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    const schema = readWorkspace('infra/ovh/postgres/schema.sql');

    for (const field of ['layout_mode', 'grid_columns', 'image_aspect_ratio', 'cover_aspect_ratio', 'cover_crop_x', 'cover_crop_y', 'cover_crop_zoom']) {
      expect(route).toContain(field);
      expect(schema).toContain(field);
    }
    for (const field of ['aspect_ratio', 'crop_x', 'crop_y', 'crop_zoom']) {
      expect(route).toContain(field);
      expect(schema).toContain(field);
    }
    expect(route).toContain("boundedNumber(source, 'cover_crop_zoom', 1, 3, 1)");
    expect(route).toContain("Math.round(boundedNumber(source, 'grid_columns', 1, 4, 3))");
  });

  it('loads the existing publication time before editing a post', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    expect(route).toContain("select('cover_storage_path,status,published_at')");
    expect(route).toContain('resolvePublishedAt(previous.data.published_at, status, now)');
    expect(route).not.toContain("published_at: status === 'published' ? new Date().toISOString() : null");
  });

  it('lets a post link to a related gallery from the same studio', () => {
    const route = read('src/pages/api/admin/[resource].ts');
    const posts = read('src/pages/admin/posts.astro');
    const schema = readWorkspace('infra/ovh/postgres/schema.sql');
    expect(route).toContain('related_gallery_id');
    expect(route).toContain("Choose a gallery from this studio.");
    expect(posts).toContain('name="related_gallery_id"');
    expect(schema).toContain('alter table studio_posts add column if not exists related_gallery_id');
  });
});
