import { userCanManageWorkspace, type DataClient } from '@leon/platform-core';

import { createStudioDatabase } from './database';

export type StudioWorkspace = { id: string; name: string; slug: string; status: string };
export type StudioSettings = {
  workspace_id: string;
  site_title: string;
  hero_title: string;
  hero_subtitle: string;
  contact_email: string | null;
  contact_phone: string | null;
  paper_color: string;
  ink_color: string;
  accent_color: string;
  font_preset: 'editorial' | 'athletic' | 'modern';
};
export type StudioGallery = {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  cover_image_url: string;
  cover_storage_path: string | null;
  layout_mode: 'grid' | 'stack';
  grid_columns: 1 | 2 | 3 | 4;
  image_aspect_ratio: 'square' | 'portrait' | 'landscape' | 'wide';
  cover_aspect_ratio: 'square' | 'portrait' | 'landscape' | 'wide';
  cover_crop_x: number;
  cover_crop_y: number;
  cover_crop_zoom: number;
  status: string;
  sort_order: number;
};
export type StudioImage = {
  id: string;
  workspace_id: string;
  gallery_id: string;
  image_url: string;
  alt_text: string;
  storage_path: string | null;
  aspect_ratio: 'inherit' | 'square' | 'portrait' | 'landscape' | 'wide';
  crop_x: number;
  crop_y: number;
  crop_zoom: number;
  sort_order: number;
};
export type StudioPost = {
  id: string;
  workspace_id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  cover_image_url: string | null;
  cover_storage_path: string | null;
  cover_aspect_ratio: 'square' | 'portrait' | 'landscape' | 'wide';
  cover_crop_x: number;
  cover_crop_y: number;
  cover_crop_zoom: number;
  status: string;
  published_at: string | null;
  sort_order: number;
};
export type StudioService = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  price_type: 'fixed' | 'from' | 'custom';
  price_cents: number | null;
  is_active: boolean;
  sort_order: number;
};
export type StudioClient = {
  id: string;
  workspace_id: string;
  service_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string;
  created_at: string;
};
export type StudioInvoice = {
  id: string;
  workspace_id: string;
  client_id: string;
  status: string;
  description: string;
  amount_due_cents: number;
  deposit_cents: number | null;
  amount_paid_cents: number;
  due_date: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
};
export type StudioInquiry = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  desired_date: string;
  message: string;
  status: string;
  created_at: string;
};
export type ConnectStatus = {
  onboarding_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
};
export type StudioUpload = {
  storage_path: string;
  public_url: string;
  original_filename: string;
  media_kind: string;
  size_bytes: number;
  created_at: string;
  used_in: Array<'galleries' | 'images' | 'posts'>;
};
export type StudioSupportTicket = {
  id: string;
  subject: string;
  details: string;
  status: 'new' | 'planned' | 'in_progress' | 'completed' | 'declined';
  created_at: string;
  updated_at: string;
};

export type StudioAdminData = {
  workspace: StudioWorkspace | null;
  settings: StudioSettings | null;
  galleries: StudioGallery[];
  images: StudioImage[];
  posts: StudioPost[];
  services: StudioService[];
  clients: StudioClient[];
  invoices: StudioInvoice[];
  inquiries: StudioInquiry[];
  uploads: StudioUpload[];
  supportTickets: StudioSupportTicket[];
  connect: ConnectStatus | null;
  error: string | null;
};

const previewWorkspace: StudioWorkspace = {
  id: 'ws_northline',
  name: 'Northline Sports',
  slug: 'northline',
  status: 'active',
};

export function previewStudioData(): StudioAdminData {
  const services: StudioService[] = [
    { id: 'service_game', workspace_id: previewWorkspace.id, name: 'Game Coverage', description: 'Photography coverage for one game.', price_type: 'from', price_cents: 45000, is_active: true, sort_order: 1 },
    { id: 'service_season', workspace_id: previewWorkspace.id, name: 'Season Coverage', description: 'Coverage for multiple games.', price_type: 'custom', price_cents: null, is_active: true, sort_order: 2 },
    { id: 'service_athlete', workspace_id: previewWorkspace.id, name: 'Athlete Session', description: 'Action photography and athlete portraits.', price_type: 'from', price_cents: 60000, is_active: true, sort_order: 3 },
  ];
  return {
    workspace: previewWorkspace,
    settings: { workspace_id: previewWorkspace.id, site_title: 'Northline Sports', hero_title: 'Northline Sports', hero_subtitle: 'Sports photography for teams and athletes.', contact_email: 'hello@northlinesports.example', contact_phone: null, paper_color: '#f4f6f8', ink_color: '#090d12', accent_color: '#ff3b30', font_preset: 'athletic' },
    galleries: [
      { id: 'gallery_football', workspace_id: previewWorkspace.id, title: 'Football', slug: 'friday-night', category: 'Game coverage', description: 'High school and club football coverage.', cover_image_url: '/images/sports/football-huddle.webp', cover_storage_path: null, layout_mode: 'grid', grid_columns: 3, image_aspect_ratio: 'landscape', cover_aspect_ratio: 'wide', cover_crop_x: 50, cover_crop_y: 52, cover_crop_zoom: 1.08, status: 'published', sort_order: 1 },
      { id: 'gallery_basketball', workspace_id: previewWorkspace.id, title: 'Basketball', slug: 'above-the-rim', category: 'Game coverage', description: 'Basketball coverage from warmup through the final possession.', cover_image_url: '/images/sports/basketball-action.webp', cover_storage_path: null, layout_mode: 'grid', grid_columns: 2, image_aspect_ratio: 'square', cover_aspect_ratio: 'landscape', cover_crop_x: 50, cover_crop_y: 50, cover_crop_zoom: 1, status: 'published', sort_order: 2 },
      { id: 'gallery_track', workspace_id: previewWorkspace.id, title: 'Track & Field', slug: 'lane-eight', category: 'Meet coverage', description: 'Track and field meets, relays, and athlete coverage.', cover_image_url: '/images/sports/track-runner.webp', cover_storage_path: null, layout_mode: 'stack', grid_columns: 2, image_aspect_ratio: 'wide', cover_aspect_ratio: 'portrait', cover_crop_x: 45, cover_crop_y: 50, cover_crop_zoom: 1.12, status: 'published', sort_order: 3 },
    ],
    images: [
      { id: 'image_1', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-huddle.webp', alt_text: 'Football teams at the line of scrimmage', storage_path: null, aspect_ratio: 'inherit', crop_x: 50, crop_y: 50, crop_zoom: 1, sort_order: 1 },
      { id: 'image_2', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-player.webp', alt_text: 'Quarterback preparing to pass', storage_path: null, aspect_ratio: 'portrait', crop_x: 54, crop_y: 44, crop_zoom: 1.18, sort_order: 2 },
      { id: 'image_3', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-field.webp', alt_text: 'Football field under stadium lights', storage_path: null, aspect_ratio: 'inherit', crop_x: 50, crop_y: 56, crop_zoom: 1.05, sort_order: 3 },
    ],
    posts: [
      { id: 'post_1', workspace_id: previewWorkspace.id, title: 'Working the Sideline', slug: 'working-the-sideline', excerpt: 'A night of football coverage.', body: 'Game notes and selected photographs.', cover_image_url: '/images/sports/football-field.webp', cover_storage_path: null, cover_aspect_ratio: 'wide', cover_crop_x: 50, cover_crop_y: 46, cover_crop_zoom: 1.1, status: 'published', published_at: '2026-07-08T12:00:00.000Z', sort_order: 1 },
    ],
    services,
    clients: [
      { id: 'client_1', workspace_id: previewWorkspace.id, service_id: 'service_game', name: 'Avery Thompson', email: 'avery@example.com', phone: null, notes: 'Home football game.', created_at: '2026-07-10T12:00:00.000Z' },
    ],
    invoices: [
      { id: 'invoice_1', workspace_id: previewWorkspace.id, client_id: 'client_1', status: 'draft', description: 'Football game coverage', amount_due_cents: 45000, deposit_cents: 15000, amount_paid_cents: 0, due_date: '2026-08-15', hosted_invoice_url: null, created_at: '2026-07-10T13:00:00.000Z' },
    ],
    inquiries: [
      { id: 'inquiry_1', workspace_id: previewWorkspace.id, name: 'Morgan Lee', email: 'morgan@example.com', phone: null, desired_date: '2026-09-12', message: 'Football coverage for our home game.', status: 'new', created_at: '2026-07-11T12:00:00.000Z' },
    ],
    uploads: [
      { storage_path: 'ws_northline/galleries/football-huddle.webp', public_url: '/images/sports/football-huddle.webp', original_filename: 'football-huddle.webp', media_kind: 'galleries', size_bytes: 842_000, created_at: '2026-07-12T12:00:00.000Z', used_in: ['galleries', 'images'] },
      { storage_path: 'ws_northline/galleries/basketball-action.webp', public_url: '/images/sports/basketball-action.webp', original_filename: 'basketball-action.webp', media_kind: 'galleries', size_bytes: 694_000, created_at: '2026-07-11T12:00:00.000Z', used_in: ['galleries'] },
      { storage_path: 'ws_northline/posts/football-field.webp', public_url: '/images/sports/football-field.webp', original_filename: 'football-field.webp', media_kind: 'posts', size_bytes: 756_000, created_at: '2026-07-10T12:00:00.000Z', used_in: ['images', 'posts'] },
    ],
    supportTickets: [
      { id: 'ticket_1', subject: 'Update homepage schedule', details: 'Please change the next available game date on the homepage.', status: 'in_progress', created_at: '2026-07-10T12:00:00.000Z', updated_at: '2026-07-11T12:00:00.000Z' },
    ],
    connect: { onboarding_status: 'pending', charges_enabled: false, payouts_enabled: false, details_submitted: false },
    error: null,
  };
}

export async function loadStudioAdminData(
  client: DataClient | null,
  workspaceId: string,
): Promise<StudioAdminData> {
  const empty: StudioAdminData = {
    workspace: null, settings: null, galleries: [], images: [], posts: [], services: [],
    clients: [], invoices: [], inquiries: [], uploads: [], supportTickets: [], connect: null, error: null,
  };
  if (!client) return { ...empty, error: 'The secure studio database is not configured.' };

  const workspaceResult = await client
    .from('client_workspaces')
    .select('id,name,slug,status')
    .eq('id', workspaceId)
    .maybeSingle<StudioWorkspace>();
  if (workspaceResult.error || !workspaceResult.data) {
    return { ...empty, error: 'This studio is not connected to your account.' };
  }
  const workspace = workspaceResult.data;
  const id = workspace.id;
  const [settings, galleries, images, posts, services, clients, invoices, inquiries, uploads, supportTickets, connect] = await Promise.all([
    client.from('studio_settings').select('workspace_id,site_title,hero_title,hero_subtitle,contact_email,contact_phone,paper_color,ink_color,accent_color,font_preset').eq('workspace_id', id).maybeSingle<StudioSettings>(),
    client.from('studio_galleries').select('id,workspace_id,title,slug,category,description,cover_image_url,cover_storage_path,layout_mode,grid_columns,image_aspect_ratio,cover_aspect_ratio,cover_crop_x,cover_crop_y,cover_crop_zoom,status,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_gallery_images').select('id,workspace_id,gallery_id,image_url,alt_text,storage_path,aspect_ratio,crop_x,crop_y,crop_zoom,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_posts').select('id,workspace_id,title,slug,excerpt,body,cover_image_url,cover_storage_path,cover_aspect_ratio,cover_crop_x,cover_crop_y,cover_crop_zoom,status,published_at,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_services').select('id,workspace_id,name,description,price_type,price_cents,is_active,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_clients').select('id,workspace_id,service_id,name,email,phone,notes,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('studio_invoices').select('id,workspace_id,client_id,status,description,amount_due_cents,deposit_cents,amount_paid_cents,due_date,hosted_invoice_url,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('studio_inquiries').select('id,workspace_id,name,email,phone,desired_date,message,status,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('workspace_uploads').select('storage_path,size_bytes,original_filename,media_kind,created_at').eq('workspace_id', id).eq('is_retained', true).order('created_at', { ascending: false }),
    client.from('content_requests').select('id,subject,details,status,created_at,updated_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('connected_payment_accounts').select('onboarding_status,charges_enabled,payouts_enabled,details_submitted').eq('workspace_id', id).maybeSingle<ConnectStatus>(),
  ]);

  const failed = [settings, galleries, images, posts, services, clients, invoices, inquiries, uploads, supportTickets, connect]
    .some((result) => Boolean(result.error));
  const galleryRows = (galleries.data ?? []) as StudioGallery[];
  const imageRows = (images.data ?? []) as StudioImage[];
  const postRows = (posts.data ?? []) as StudioPost[];
  const galleryPaths = new Set(galleryRows.map((item) => item.cover_storage_path).filter(Boolean));
  const imagePaths = new Set(imageRows.map((item) => item.storage_path).filter(Boolean));
  const postPaths = new Set(postRows.map((item) => item.cover_storage_path).filter(Boolean));
  const mediaOrigin = (process.env.PUBLIC_MEDIA_URL ?? 'https://api.leonsites.org').replace(/\/$/, '');
  const mediaRows = (uploads.data ?? []).map((upload) => {
    const storagePath = String(upload.storage_path ?? '');
    const fallbackName = storagePath.split('/').at(-1) ?? 'image';
    const usedIn: StudioUpload['used_in'] = [];
    if (galleryPaths.has(storagePath)) usedIn.push('galleries');
    if (imagePaths.has(storagePath)) usedIn.push('images');
    if (postPaths.has(storagePath)) usedIn.push('posts');
    return {
      storage_path: storagePath,
      public_url: `${mediaOrigin}/media/${storagePath.split('/').map(encodeURIComponent).join('/')}`,
      original_filename: String(upload.original_filename ?? fallbackName),
      media_kind: String(upload.media_kind ?? storagePath.split('/')[1] ?? 'library'),
      size_bytes: Number(upload.size_bytes ?? 0),
      created_at: String(upload.created_at ?? ''),
      used_in: usedIn,
    };
  });
  return {
    workspace,
    settings: settings.data,
    galleries: galleryRows,
    images: imageRows,
    posts: postRows,
    services: (services.data ?? []) as StudioService[],
    clients: (clients.data ?? []) as StudioClient[],
    invoices: (invoices.data ?? []) as StudioInvoice[],
    inquiries: (inquiries.data ?? []) as StudioInquiry[],
    uploads: mediaRows,
    supportTickets: (supportTickets.data ?? []) as StudioSupportTicket[],
    connect: connect.data,
    error: failed ? 'Some studio records could not be loaded.' : null,
  };
}

export async function resolveManagedStudio(clerkUserId: string, workspaceId: string) {
  const client = createStudioDatabase();
  if (!client) return { client: null, workspaceId: null };
  const workspace = await client
    .from('client_workspaces')
    .select('id')
    .eq('id', workspaceId)
    .maybeSingle<{ id: string }>();
  if (!workspace.data || !(await userCanManageWorkspace(client, clerkUserId, workspace.data.id, { allowPlatformAdmin: true }))) {
    return { client: null, workspaceId: null };
  }
  return { client, workspaceId: workspace.data.id };
}

export async function loadStudioSession(input: {
  isPreview: boolean;
  userId: string | null;
  workspaceId: string;
  getToken: () => Promise<string | null>;
}) {
  if (input.isPreview) return { authenticated: true, authorized: true, data: previewStudioData() };
  if (!input.userId) return { authenticated: false, authorized: false, data: null };
  const { client } = await resolveManagedStudio(input.userId, input.workspaceId);
  if (!client) {
    return { authenticated: true, authorized: false, data: null };
  }
  return { authenticated: true, authorized: true, data: await loadStudioAdminData(client, input.workspaceId) };
}

export function decideStudioAdminAccess(
  session: { authenticated: boolean; authorized: boolean },
  pathname: string,
) {
  if (!session.authenticated) {
    return { kind: 'redirect' as const, location: `/sign-in?redirect_url=${encodeURIComponent(pathname)}` };
  }
  if (!session.authorized) {
    return { kind: 'forbidden' as const, location: '/admin/access-denied' };
  }
  return { kind: 'admin' as const };
}

export const dollars = (cents: number | null) => cents === null
  ? 'Custom'
  : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
