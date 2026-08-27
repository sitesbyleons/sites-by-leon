import { isManagedUploadPath } from '@leon/platform-core/image-storage';
import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { DataClient } from '@leon/platform-core';
import type { APIRoute } from 'astro';

import { MIN_STRIPE_USD_CENTS, parseUsdCents } from '../../../lib/invoice-events';
import { mediaStorage } from '../../../lib/media-storage';
import { resolvePublishedAt } from '../../../lib/post-publication';
import { resolveManagedStudio } from '../../../lib/studio';
import { sweepOrphanedUploads } from '../../../lib/upload-cleanup';

export const prerender = false;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colorPattern = /^#[0-9a-f]{6}$/i;
const mediaAspectRatios = new Set(['square', 'portrait', 'landscape', 'wide']);
const imageAspectRatios = new Set(['inherit', ...mediaAspectRatios]);
const orderable = new Set(['galleries', 'images', 'posts', 'services']);
const deletable = new Set(['galleries', 'images', 'posts', 'services', 'clients', 'invoices']);
const text = (source: Record<string, unknown>, key: string, max = 2000) => {
  const value = typeof source[key] === 'string' ? source[key].trim() : '';
  return value.slice(0, max);
};
const nullable = (value: string) => value || null;
const managedPath = (workspaceId: string, value: string) => value.startsWith(`${workspaceId}/`) ? value : null;
const boundedNumber = (source: Record<string, unknown>, key: string, minimum: number, maximum: number, fallback: number) => {
  const value = Number(source[key]);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
};
const mediaAspectRatio = (source: Record<string, unknown>, key: string, fallback = 'landscape') => {
  const value = text(source, key, 20);
  return mediaAspectRatios.has(value) ? value : fallback;
};

type UploadBackedResource =
  | { table: 'studio_galleries'; pathColumn: 'cover_storage_path'; path: string }
  | { table: 'studio_gallery_images'; pathColumn: 'storage_path'; path: string }
  | { table: 'studio_posts'; pathColumn: 'cover_storage_path'; path: string };

const findUploadBackedResource = (client: DataClient, workspaceId: string, upload: UploadBackedResource) => client
  .from(upload.table)
  .select('id')
  .eq('workspace_id', workspaceId)
  .eq(upload.pathColumn, upload.path)
  .maybeSingle<{ id: string }>();

const isUniqueViolation = (message = '') => /duplicate key|unique constraint/i.test(message);

async function removeFiles(client: DataClient, workspaceId: string, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  await Promise.all(unique.map(async (managedPath) => {
    const upload = await client.from('workspace_uploads')
      .select('is_retained')
      .eq('workspace_id', workspaceId)
      .eq('storage_path', managedPath)
      .maybeSingle<{ is_retained: boolean }>();
    if (upload.data?.is_retained) return;
    if (!isManagedUploadPath(workspaceId, managedPath)) return;
    await mediaStorage().remove(workspaceId, managedPath);
    const released = await client.releaseWorkspaceUpload(workspaceId, managedPath);
    if (released.error) throw new Error(released.error.message);
  }));
}

const route: APIRoute = async ({ request, locals, params, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 32_000) return Response.json({ message: 'Request is too large.' }, { status: 413 });

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const managedStudio = await resolveManagedStudio(auth.userId, locals.siteContext.workspaceId);
  if (!managedStudio.client || !managedStudio.workspaceId) return Response.json({ message: 'You do not have access to this studio.' }, { status: 403 });
  const client = managedStudio.client;

  let source: Record<string, unknown>;
  try { source = await request.json(); } catch { return Response.json({ message: 'Invalid request.' }, { status: 400 }); }

  const workspaceId = managedStudio.workspaceId;
  const resource = params.resource ?? '';
  const id = text(source, 'id', 64);
  const method = request.method;

  if (method === 'PATCH') {
    const direction = text(source, 'direction', 10);
    if (!orderable.has(resource) || !uuidPattern.test(id) || !['up', 'down'].includes(direction)) return Response.json({ message: 'Invalid move.' }, { status: 422 });
    const table = resource === 'galleries' ? 'studio_galleries' : resource === 'images' ? 'studio_gallery_images' : resource === 'posts' ? 'studio_posts' : 'studio_services';
    const current = await client.from(table).select(resource === 'images' ? 'id,sort_order,gallery_id' : 'id,sort_order').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<Record<string, unknown>>();
    if (!current.data) return Response.json({ message: 'Item not found.' }, { status: 404 });
    const moved = await client.moveOrderedItem(table, workspaceId, id, direction as 'up' | 'down');
    if (moved.error) return Response.json({ message: 'Item could not be moved.' }, { status: 400 });
    return Response.json({ ok: true, reload: moved.data.length > 0 });
  }

  if (method === 'DELETE') {
    if (!deletable.has(resource) || !uuidPattern.test(id)) return Response.json({ message: 'Invalid item.' }, { status: 422 });
    const table = resource === 'galleries' ? 'studio_galleries'
      : resource === 'images' ? 'studio_gallery_images'
        : resource === 'posts' ? 'studio_posts'
          : resource === 'services' ? 'studio_services'
            : resource === 'clients' ? 'studio_clients'
              : 'studio_invoices';
    let paths: Array<string | null> = [];
    if (resource === 'galleries') {
      const gallery = await client.from('studio_galleries').select('cover_storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ cover_storage_path: string | null }>();
      const images = await client.from('studio_gallery_images').select('storage_path').eq('workspace_id', workspaceId).eq('gallery_id', id);
      paths = [gallery.data?.cover_storage_path ?? null, ...(images.data ?? []).map((row) => row.storage_path as string | null)];
    } else if (resource === 'images') {
      const row = await client.from(table).select('storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ storage_path: string | null }>();
      paths = [row.data?.storage_path ?? null];
    } else if (resource === 'posts') {
      const row = await client.from(table).select('cover_storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ cover_storage_path: string | null }>();
      paths = [row.data?.cover_storage_path ?? null];
    } else if (resource === 'clients') {
      const invoice = await client.from('studio_invoices').select('id').eq('workspace_id', workspaceId).eq('client_id', id).limit(1).maybeSingle();
      if (invoice.data) return Response.json({ message: 'Keep this client because an invoice is attached.' }, { status: 409 });
    } else if (resource === 'invoices') {
      const invoice = await client.from('studio_invoices').select('status').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ status: string }>();
      if (!invoice.data) return Response.json({ message: 'Invoice not found.' }, { status: 404 });
      if (invoice.data.status !== 'draft') return Response.json({ message: 'Only draft invoices can be deleted.' }, { status: 409 });
    }
    let deletion = client.from(table).delete().eq('workspace_id', workspaceId).eq('id', id);
    if (resource === 'invoices') deletion = deletion.eq('status', 'draft');
    const result = await deletion;
    if (result.error) return Response.json({ message: 'Item could not be deleted.' }, { status: 400 });
    if (!result.data.length) return Response.json({
      message: resource === 'invoices' ? 'This invoice is already being sent and cannot be deleted.' : 'Item not found.',
    }, { status: resource === 'invoices' ? 409 : 404 });
    await removeFiles(client, workspaceId, paths.map((path) => path ? managedPath(workspaceId, path) : null)).catch(() => null);
    await sweepOrphanedUploads(client, workspaceId, mediaStorage());
    return Response.json({ ok: true });
  }

  if (method !== 'POST') return Response.json({ message: 'Method not allowed.' }, { status: 405 });

  let operation: PromiseLike<{ data: Record<string, unknown>[]; error: { message?: string } | null }>;
  let oldPath: string | null = null;
  let uploadBackedCreate: UploadBackedResource | null = null;
  let quotaLimitedCreate: 'galleries' | 'images' | null = null;

  if (resource === 'settings') {
    const siteTitle = text(source, 'site_title', 100);
    const heroTitle = text(source, 'hero_title', 120);
    const heroSubtitle = text(source, 'hero_subtitle', 240);
    const paperColor = text(source, 'paper_color', 7);
    const inkColor = text(source, 'ink_color', 7);
    const accentColor = text(source, 'accent_color', 7);
    const fontPreset = text(source, 'font_preset', 20);
    if (siteTitle.length < 2 || heroTitle.length < 2 || heroSubtitle.length < 2) return Response.json({ message: 'Complete the site name and homepage text.' }, { status: 422 });
    if (![paperColor, inkColor, accentColor].every((color) => colorPattern.test(color)) || !['editorial', 'athletic', 'modern'].includes(fontPreset)) return Response.json({ message: 'Choose valid brand colors and a font style.' }, { status: 422 });
    operation = client.from('studio_settings').upsert({ workspace_id: workspaceId, site_title: siteTitle, hero_title: heroTitle, hero_subtitle: heroSubtitle, contact_email: nullable(text(source, 'contact_email', 254)), contact_phone: nullable(text(source, 'contact_phone', 32)), paper_color: paperColor, ink_color: inkColor, accent_color: accentColor, font_preset: fontPreset });
  } else if (resource === 'galleries') {
    const title = text(source, 'title', 100);
    const slug = text(source, 'slug', 100);
    const category = text(source, 'category', 100);
    const cover = text(source, 'cover_image_url', 2048);
    const coverPath = managedPath(workspaceId, text(source, 'cover_storage_path', 1024));
    const status = text(source, 'status', 20) === 'published' ? 'published' : 'draft';
    const layoutMode = text(source, 'layout_mode', 20) === 'stack' ? 'stack' : 'grid';
    const gridColumns = Math.round(boundedNumber(source, 'grid_columns', 1, 4, 3));
    const imageAspectRatio = mediaAspectRatio(source, 'image_aspect_ratio');
    const coverAspectRatio = mediaAspectRatio(source, 'cover_aspect_ratio');
    const coverCropX = Math.round(boundedNumber(source, 'cover_crop_x', 0, 100, 50));
    const coverCropY = Math.round(boundedNumber(source, 'cover_crop_y', 0, 100, 50));
    const coverCropZoom = boundedNumber(source, 'cover_crop_zoom', 1, 3, 1);
    if (title.length < 2 || category.length < 2 || !slugPattern.test(slug) || !cover) return Response.json({ message: 'Complete the gallery title, URL, category, and cover image.' }, { status: 422 });
    const values = {
      title,
      slug,
      category,
      cover_image_url: cover,
      cover_storage_path: coverPath,
      description: text(source, 'description', 500),
      layout_mode: layoutMode,
      grid_columns: gridColumns,
      image_aspect_ratio: imageAspectRatio,
      cover_aspect_ratio: coverAspectRatio,
      cover_crop_x: coverCropX,
      cover_crop_y: coverCropY,
      cover_crop_zoom: coverCropZoom,
      status,
    };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid gallery.' }, { status: 422 });
      const previous = await client.from('studio_galleries').select('cover_storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ cover_storage_path: string | null }>();
      oldPath = previous.data?.cover_storage_path ?? null;
      operation = client.from('studio_galleries').update(values).eq('workspace_id', workspaceId).eq('id', id);
    } else {
      if (coverPath) {
        uploadBackedCreate = { table: 'studio_galleries', pathColumn: 'cover_storage_path', path: coverPath };
        const existing = await findUploadBackedResource(client, workspaceId, uploadBackedCreate);
        if (existing.error) return Response.json({ message: 'Existing image use could not be checked. Try again.' }, { status: 503 });
        if (existing.data) return Response.json({ ok: true, id: existing.data.id });
      }
      quotaLimitedCreate = 'galleries';
      operation = client.insertOrdered('studio_galleries', workspaceId, values);
    }
  } else if (resource === 'images') {
    const galleryId = text(source, 'gallery_id', 64);
    const imageUrl = text(source, 'image_url', 2048);
    const altText = text(source, 'alt_text', 300);
    const storagePath = managedPath(workspaceId, text(source, 'storage_path', 1024));
    const requestedAspectRatio = text(source, 'aspect_ratio', 20);
    const aspectRatio = imageAspectRatios.has(requestedAspectRatio) ? requestedAspectRatio : 'inherit';
    const cropX = Math.round(boundedNumber(source, 'crop_x', 0, 100, 50));
    const cropY = Math.round(boundedNumber(source, 'crop_y', 0, 100, 50));
    const cropZoom = boundedNumber(source, 'crop_zoom', 1, 3, 1);
    if (!imageUrl || altText.length < 2 || (!id && !uuidPattern.test(galleryId))) return Response.json({ message: 'Choose a gallery, image, and description.' }, { status: 422 });
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid image.' }, { status: 422 });
      const previous = await client.from('studio_gallery_images').select('storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ storage_path: string | null }>();
      oldPath = previous.data?.storage_path ?? null;
      operation = client.from('studio_gallery_images').update({ image_url: imageUrl, alt_text: altText, storage_path: storagePath, aspect_ratio: aspectRatio, crop_x: cropX, crop_y: cropY, crop_zoom: cropZoom }).eq('workspace_id', workspaceId).eq('id', id);
    } else {
      const gallery = await client.from('studio_galleries').select('id').eq('workspace_id', workspaceId).eq('id', galleryId).maybeSingle();
      if (!gallery.data) return Response.json({ message: 'Choose a gallery from this studio.' }, { status: 422 });
      if (storagePath) {
        uploadBackedCreate = { table: 'studio_gallery_images', pathColumn: 'storage_path', path: storagePath };
        const existing = await findUploadBackedResource(client, workspaceId, uploadBackedCreate);
        if (existing.error) return Response.json({ message: 'Existing image use could not be checked. Try again.' }, { status: 503 });
        if (existing.data) return Response.json({ ok: true, id: existing.data.id });
      }
      quotaLimitedCreate = 'images';
      operation = client.insertOrdered('studio_gallery_images', workspaceId, { gallery_id: galleryId, image_url: imageUrl, alt_text: altText, storage_path: storagePath, aspect_ratio: aspectRatio, crop_x: cropX, crop_y: cropY, crop_zoom: cropZoom });
    }
  } else if (resource === 'posts') {
    const title = text(source, 'title', 140);
    const slug = text(source, 'slug', 140);
    const status = text(source, 'status', 20) === 'published' ? 'published' : 'draft';
    const coverPath = managedPath(workspaceId, text(source, 'cover_storage_path', 1024));
    const coverAspectRatio = mediaAspectRatio(source, 'cover_aspect_ratio');
    const coverCropX = Math.round(boundedNumber(source, 'cover_crop_x', 0, 100, 50));
    const coverCropY = Math.round(boundedNumber(source, 'cover_crop_y', 0, 100, 50));
    const coverCropZoom = boundedNumber(source, 'cover_crop_zoom', 1, 3, 1);
    const relatedGalleryId = nullable(text(source, 'related_gallery_id', 64));
    if (relatedGalleryId) {
      if (!uuidPattern.test(relatedGalleryId)) return Response.json({ message: 'Choose a valid related gallery.' }, { status: 422 });
      const related = await client.from('studio_galleries').select('id').eq('workspace_id', workspaceId).eq('id', relatedGalleryId).maybeSingle();
      if (!related.data) return Response.json({ message: 'Choose a gallery from this studio.' }, { status: 422 });
    }
    if (title.length < 2 || !slugPattern.test(slug)) return Response.json({ message: 'Enter a post title and valid URL slug.' }, { status: 422 });
    const now = new Date().toISOString();
    const values = { title, slug, excerpt: text(source, 'excerpt', 400), body: text(source, 'body', 20000), cover_image_url: nullable(text(source, 'cover_image_url', 2048)), cover_storage_path: coverPath, cover_aspect_ratio: coverAspectRatio, cover_crop_x: coverCropX, cover_crop_y: coverCropY, cover_crop_zoom: coverCropZoom, related_gallery_id: relatedGalleryId, status };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid post.' }, { status: 422 });
      const previous = await client.from('studio_posts')
        .select('cover_storage_path,status,published_at')
        .eq('workspace_id', workspaceId)
        .eq('id', id)
        .maybeSingle<{ cover_storage_path: string | null; status: string; published_at: string | null }>();
      if (previous.error) return Response.json({ message: 'The existing post could not be loaded.' }, { status: 503 });
      if (!previous.data) return Response.json({ message: 'This post no longer exists.' }, { status: 404 });
      oldPath = previous.data.cover_storage_path;
      operation = client.from('studio_posts').update({
        ...values,
        published_at: resolvePublishedAt(previous.data.published_at, status, now),
      }).eq('workspace_id', workspaceId).eq('id', id);
    } else {
      if (coverPath) {
        uploadBackedCreate = { table: 'studio_posts', pathColumn: 'cover_storage_path', path: coverPath };
        const existing = await findUploadBackedResource(client, workspaceId, uploadBackedCreate);
        if (existing.error) return Response.json({ message: 'Existing image use could not be checked. Try again.' }, { status: 503 });
        if (existing.data) return Response.json({ ok: true, id: existing.data.id });
      }
      operation = client.insertOrdered('studio_posts', workspaceId, {
        ...values,
        published_at: resolvePublishedAt(null, status, now),
      });
    }
  } else if (resource === 'services') {
    const name = text(source, 'name', 100);
    const priceType = text(source, 'price_type', 20);
    const dollars = Number(text(source, 'price', 20));
    if (name.length < 2 || !['fixed', 'from', 'custom'].includes(priceType)) return Response.json({ message: 'Enter a service name and price style.' }, { status: 422 });
    if (priceType !== 'custom' && (!Number.isFinite(dollars) || dollars < 0)) return Response.json({ message: 'Enter a valid price.' }, { status: 422 });
    const values = { name, description: text(source, 'description', 1000), price_type: priceType, price_cents: priceType === 'custom' ? null : Math.round(dollars * 100), is_active: source.is_active === true || source.is_active === 'on' };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid service.' }, { status: 422 });
      operation = client.from('studio_services').update(values).eq('workspace_id', workspaceId).eq('id', id);
    } else operation = client.insertOrdered('studio_services', workspaceId, values);
  } else if (resource === 'clients') {
    const name = text(source, 'name', 120); const email = text(source, 'email', 254); const phone = text(source, 'phone', 32); const serviceId = text(source, 'service_id', 64);
    if (name.length < 2 || (!email && !phone)) return Response.json({ message: 'Enter a name and either email or phone.' }, { status: 422 });
    if (serviceId && !uuidPattern.test(serviceId)) return Response.json({ message: 'Choose a valid service.' }, { status: 422 });
    if (serviceId) { const selected = await client.from('studio_services').select('id').eq('id', serviceId).eq('workspace_id', workspaceId).maybeSingle(); if (!selected.data) return Response.json({ message: 'Choose a service from this studio.' }, { status: 422 }); }
    const values = { service_id: nullable(serviceId), name, email: nullable(email), phone: nullable(phone), notes: text(source, 'notes', 3000) };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid client.' }, { status: 422 });
      operation = client.from('studio_clients').update(values).eq('workspace_id', workspaceId).eq('id', id);
    } else operation = client.from('studio_clients').insert({ workspace_id: workspaceId, ...values });
  } else if (resource === 'invoices') {
    const clientId = text(source, 'client_id', 64); const description = text(source, 'description', 1000); const amount = parseUsdCents(text(source, 'amount', 20)); const depositText = text(source, 'deposit', 20); const deposit = depositText ? parseUsdCents(depositText) : null;
    if (!uuidPattern.test(clientId) || description.length < 2 || amount === null || (depositText && deposit === null) || (deposit !== null && (deposit >= amount || amount - deposit < MIN_STRIPE_USD_CENTS))) return Response.json({ message: 'Choose a client and enter valid invoice amounts of at least $0.50 per payment.' }, { status: 422 });
    const selected = await client.from('studio_clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle();
    if (!selected.data) return Response.json({ message: 'Choose a client from this studio.' }, { status: 422 });
    const values = { client_id: clientId, description, amount_due_cents: amount, deposit_cents: deposit, due_date: nullable(text(source, 'due_date', 10)) };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid invoice.' }, { status: 422 });
      const current = await client.from('studio_invoices').select('status').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ status: string }>();
      if (!current.data || current.data.status !== 'draft') return Response.json({ message: 'Only draft invoices can be edited.' }, { status: 409 });
      const updated = await client.from('studio_invoices').update(values).eq('workspace_id', workspaceId).eq('id', id).eq('status', 'draft');
      if (updated.error) return Response.json({ message: 'Changes could not be saved.' }, { status: 400 });
      if (!updated.data.length) return Response.json({ message: 'This invoice is already being sent and cannot be edited.' }, { status: 409 });
      return Response.json({ ok: true, id });
    } else operation = client.from('studio_invoices').insert({ workspace_id: workspaceId, ...values, status: 'draft' });
  } else if (resource === 'inquiries') {
    const status = text(source, 'status', 20);
    if (!uuidPattern.test(id) || !['new', 'contacted', 'booked', 'closed'].includes(status)) return Response.json({ message: 'Choose a valid inquiry status.' }, { status: 422 });
    operation = client.from('studio_inquiries').update({ status }).eq('workspace_id', workspaceId).eq('id', id);
  } else return Response.json({ message: 'Unknown studio resource.' }, { status: 404 });

  const result = await operation;
  if (result.error) {
    if (uploadBackedCreate && isUniqueViolation(result.error.message)) {
      const existing = await findUploadBackedResource(client, workspaceId, uploadBackedCreate);
      if (existing.error) return Response.json({ message: 'Existing image use could not be checked. Try again.' }, { status: 503 });
      if (existing.data) return Response.json({ ok: true, id: existing.data.id });
    }
    return Response.json({ message: 'Changes could not be saved.' }, { status: 400 });
  }
  if (!result.data.length) {
    if (quotaLimitedCreate) {
      const message = quotaLimitedCreate === 'galleries'
        ? 'This studio has reached its limit of 100 galleries.'
        : 'This studio has reached its limit of 5,000 gallery images.';
      return Response.json({ message }, { status: 409 });
    }
    return Response.json({ message: 'This item no longer exists. Refresh and try again.' }, { status: 404 });
  }
  const newPath = text(source, resource === 'images' ? 'storage_path' : 'cover_storage_path', 1024);
  if (oldPath && oldPath !== newPath) await removeFiles(client, workspaceId, [managedPath(workspaceId, oldPath)]).catch(() => null);
  await sweepOrphanedUploads(client, workspaceId, mediaStorage());
  const resourceId = typeof result.data[0]?.id === 'string' ? result.data[0].id : null;
  return Response.json(resourceId ? { ok: true, id: resourceId } : { ok: true });
};

export const POST = route;
export const PATCH = route;
export const DELETE = route;
