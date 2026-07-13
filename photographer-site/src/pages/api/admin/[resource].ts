import { unlink } from 'node:fs/promises';

import { resolveManagedUpload } from '@leon/platform-core/image-storage';
import { isTrustedOrigin } from '@leon/platform-core/request-security';
import type { DataClient } from '@leon/platform-core';
import type { APIRoute } from 'astro';

import { resolveManagedStudio } from '../../../lib/studio';

export const prerender = false;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colorPattern = /^#[0-9a-f]{6}$/i;
const orderable = new Set(['galleries', 'images', 'posts', 'services']);
const deletable = new Set(['galleries', 'images', 'posts', 'services']);
const uploadRoot = process.env.UPLOAD_ROOT ?? '/data/uploads';

const text = (source: Record<string, unknown>, key: string, max = 2000) => {
  const value = typeof source[key] === 'string' ? source[key].trim() : '';
  return value.slice(0, max);
};
const nullable = (value: string) => value || null;
const managedPath = (workspaceId: string, value: string) => value.startsWith(`${workspaceId}/`) ? value : null;

async function nextSort(client: DataClient, table: string, workspaceId: string, extra?: { column: string; value: string }) {
  let query = client.from(table).select('sort_order').eq('workspace_id', workspaceId).order('sort_order', { ascending: false }).limit(1);
  if (extra) query = query.eq(extra.column, extra.value);
  const result = await query.maybeSingle<{ sort_order: number }>();
  return (result.data?.sort_order ?? 0) + 1;
}

async function removeFiles(workspaceId: string, paths: Array<string | null | undefined>) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  await Promise.all(unique.map(async (managedPath) => {
    const absolute = resolveManagedUpload(uploadRoot, workspaceId, managedPath);
    if (!absolute) return;
    await unlink(absolute).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }));
}

const route: APIRoute = async ({ request, locals, params, url }) => {
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) return Response.json({ message: 'Request not allowed.' }, { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > 32_000) return Response.json({ message: 'Request is too large.' }, { status: 413 });

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const managedStudio = await resolveManagedStudio(auth.userId);
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
    let list = client.from(table).select('id,sort_order').eq('workspace_id', workspaceId).order('sort_order').order('created_at');
    if (resource === 'images') list = list.eq('gallery_id', String(current.data.gallery_id));
    const rows = (await list).data ?? [];
    const index = rows.findIndex((row) => row.id === id);
    const neighbor = rows[index + (direction === 'up' ? -1 : 1)];
    if (!neighbor) return Response.json({ ok: true, reload: false });
    const currentOrder = Number(current.data.sort_order ?? index + 1);
    const neighborOrder = Number(neighbor.sort_order ?? index + (direction === 'up' ? 0 : 2));
    const first = await client.from(table).update({ sort_order: neighborOrder }).eq('workspace_id', workspaceId).eq('id', id);
    if (first.error) return Response.json({ message: 'Item could not be moved.' }, { status: 400 });
    const second = await client.from(table).update({ sort_order: currentOrder }).eq('workspace_id', workspaceId).eq('id', neighbor.id);
    return second.error ? Response.json({ message: 'Item could not be moved.' }, { status: 400 }) : Response.json({ ok: true });
  }

  if (method === 'DELETE') {
    if (!deletable.has(resource) || !uuidPattern.test(id)) return Response.json({ message: 'Invalid item.' }, { status: 422 });
    const table = resource === 'galleries' ? 'studio_galleries' : resource === 'images' ? 'studio_gallery_images' : resource === 'posts' ? 'studio_posts' : 'studio_services';
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
    }
    const result = await client.from(table).delete().eq('workspace_id', workspaceId).eq('id', id);
    if (result.error) return Response.json({ message: 'Item could not be deleted.' }, { status: 400 });
    await removeFiles(workspaceId, paths.map((path) => path ? managedPath(workspaceId, path) : null));
    return Response.json({ ok: true });
  }

  if (method !== 'POST') return Response.json({ message: 'Method not allowed.' }, { status: 405 });

  let operation: PromiseLike<{ error: { message?: string } | null }>;
  let oldPath: string | null = null;

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
    if (title.length < 2 || category.length < 2 || !slugPattern.test(slug) || !cover) return Response.json({ message: 'Complete the gallery title, URL, category, and cover image.' }, { status: 422 });
    const values = { title, slug, category, cover_image_url: cover, cover_storage_path: coverPath, description: text(source, 'description', 500), status };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid gallery.' }, { status: 422 });
      const previous = await client.from('studio_galleries').select('cover_storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ cover_storage_path: string | null }>();
      oldPath = previous.data?.cover_storage_path ?? null;
      operation = client.from('studio_galleries').update(values).eq('workspace_id', workspaceId).eq('id', id);
    } else operation = client.from('studio_galleries').insert({ ...values, workspace_id: workspaceId, sort_order: await nextSort(client, 'studio_galleries', workspaceId) });
  } else if (resource === 'images') {
    const galleryId = text(source, 'gallery_id', 64);
    const imageUrl = text(source, 'image_url', 2048);
    const altText = text(source, 'alt_text', 300);
    const storagePath = managedPath(workspaceId, text(source, 'storage_path', 1024));
    if (!imageUrl || altText.length < 2 || (!id && !uuidPattern.test(galleryId))) return Response.json({ message: 'Choose a gallery, image, and description.' }, { status: 422 });
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid image.' }, { status: 422 });
      const previous = await client.from('studio_gallery_images').select('storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ storage_path: string | null }>();
      oldPath = previous.data?.storage_path ?? null;
      operation = client.from('studio_gallery_images').update({ image_url: imageUrl, alt_text: altText, storage_path: storagePath }).eq('workspace_id', workspaceId).eq('id', id);
    } else {
      const gallery = await client.from('studio_galleries').select('id').eq('workspace_id', workspaceId).eq('id', galleryId).maybeSingle();
      if (!gallery.data) return Response.json({ message: 'Choose a gallery from this studio.' }, { status: 422 });
      operation = client.from('studio_gallery_images').insert({ workspace_id: workspaceId, gallery_id: galleryId, image_url: imageUrl, alt_text: altText, storage_path: storagePath, sort_order: await nextSort(client, 'studio_gallery_images', workspaceId, { column: 'gallery_id', value: galleryId }) });
    }
  } else if (resource === 'posts') {
    const title = text(source, 'title', 140);
    const slug = text(source, 'slug', 140);
    const status = text(source, 'status', 20) === 'published' ? 'published' : 'draft';
    const coverPath = managedPath(workspaceId, text(source, 'cover_storage_path', 1024));
    if (title.length < 2 || !slugPattern.test(slug)) return Response.json({ message: 'Enter a post title and valid URL slug.' }, { status: 422 });
    const values = { title, slug, excerpt: text(source, 'excerpt', 400), body: text(source, 'body', 20000), cover_image_url: nullable(text(source, 'cover_image_url', 2048)), cover_storage_path: coverPath, status, published_at: status === 'published' ? new Date().toISOString() : null };
    if (id) {
      if (!uuidPattern.test(id)) return Response.json({ message: 'Invalid post.' }, { status: 422 });
      const previous = await client.from('studio_posts').select('cover_storage_path').eq('workspace_id', workspaceId).eq('id', id).maybeSingle<{ cover_storage_path: string | null }>();
      oldPath = previous.data?.cover_storage_path ?? null;
      operation = client.from('studio_posts').update(values).eq('workspace_id', workspaceId).eq('id', id);
    } else operation = client.from('studio_posts').insert({ ...values, workspace_id: workspaceId, sort_order: await nextSort(client, 'studio_posts', workspaceId) });
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
    } else operation = client.from('studio_services').insert({ ...values, workspace_id: workspaceId, sort_order: await nextSort(client, 'studio_services', workspaceId) });
  } else if (resource === 'clients') {
    const name = text(source, 'name', 120); const email = text(source, 'email', 254); const phone = text(source, 'phone', 32); const serviceId = text(source, 'service_id', 64);
    if (name.length < 2 || (!email && !phone)) return Response.json({ message: 'Enter a name and either email or phone.' }, { status: 422 });
    if (serviceId && !uuidPattern.test(serviceId)) return Response.json({ message: 'Choose a valid service.' }, { status: 422 });
    if (serviceId) { const selected = await client.from('studio_services').select('id').eq('id', serviceId).eq('workspace_id', workspaceId).maybeSingle(); if (!selected.data) return Response.json({ message: 'Choose a service from this studio.' }, { status: 422 }); }
    operation = client.from('studio_clients').insert({ workspace_id: workspaceId, service_id: nullable(serviceId), name, email: nullable(email), phone: nullable(phone), notes: text(source, 'notes', 3000) });
  } else if (resource === 'invoices') {
    const clientId = text(source, 'client_id', 64); const description = text(source, 'description', 1000); const amount = Number(text(source, 'amount', 20)); const depositText = text(source, 'deposit', 20); const deposit = depositText ? Number(depositText) : null;
    if (!uuidPattern.test(clientId) || description.length < 2 || !Number.isFinite(amount) || amount <= 0 || (deposit !== null && (!Number.isFinite(deposit) || deposit < 0 || deposit > amount))) return Response.json({ message: 'Choose a client and enter valid invoice amounts.' }, { status: 422 });
    const selected = await client.from('studio_clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle();
    if (!selected.data) return Response.json({ message: 'Choose a client from this studio.' }, { status: 422 });
    operation = client.from('studio_invoices').insert({ workspace_id: workspaceId, client_id: clientId, description, amount_due_cents: Math.round(amount * 100), deposit_cents: deposit === null ? null : Math.round(deposit * 100), due_date: nullable(text(source, 'due_date', 10)), status: 'draft' });
  } else return Response.json({ message: 'Unknown studio resource.' }, { status: 404 });

  const result = await operation;
  if (result.error) return Response.json({ message: 'Changes could not be saved.' }, { status: 400 });
  const newPath = text(source, resource === 'images' ? 'storage_path' : 'cover_storage_path', 1024);
  if (oldPath && oldPath !== newPath) await removeFiles(workspaceId, [managedPath(workspaceId, oldPath)]);
  return Response.json({ ok: true });
};

export const POST = route;
export const PATCH = route;
export const DELETE = route;
