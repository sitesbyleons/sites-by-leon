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
      { id: 'gallery_football', workspace_id: previewWorkspace.id, title: 'Football', slug: 'friday-night', category: 'Game coverage', description: 'High school and club football coverage.', cover_image_url: '/images/sports/football-huddle.webp', cover_storage_path: null, status: 'published', sort_order: 1 },
      { id: 'gallery_basketball', workspace_id: previewWorkspace.id, title: 'Basketball', slug: 'above-the-rim', category: 'Game coverage', description: 'Basketball coverage from warmup through the final possession.', cover_image_url: '/images/sports/basketball-action.webp', cover_storage_path: null, status: 'published', sort_order: 2 },
      { id: 'gallery_track', workspace_id: previewWorkspace.id, title: 'Track & Field', slug: 'lane-eight', category: 'Meet coverage', description: 'Track and field meets, relays, and athlete coverage.', cover_image_url: '/images/sports/track-runner.webp', cover_storage_path: null, status: 'published', sort_order: 3 },
    ],
    images: [
      { id: 'image_1', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-huddle.webp', alt_text: 'Football teams at the line of scrimmage', storage_path: null, sort_order: 1 },
      { id: 'image_2', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-player.webp', alt_text: 'Quarterback preparing to pass', storage_path: null, sort_order: 2 },
      { id: 'image_3', workspace_id: previewWorkspace.id, gallery_id: 'gallery_football', image_url: '/images/sports/football-field.webp', alt_text: 'Football field under stadium lights', storage_path: null, sort_order: 3 },
    ],
    posts: [
      { id: 'post_1', workspace_id: previewWorkspace.id, title: 'Working the Sideline', slug: 'working-the-sideline', excerpt: 'A night of football coverage.', body: 'Game notes and selected photographs.', cover_image_url: '/images/sports/football-field.webp', cover_storage_path: null, status: 'published', published_at: '2026-07-08T12:00:00.000Z', sort_order: 1 },
    ],
    services,
    clients: [
      { id: 'client_1', workspace_id: previewWorkspace.id, service_id: 'service_game', name: 'Avery Thompson', email: 'avery@example.com', phone: null, notes: 'Home football game.', created_at: '2026-07-10T12:00:00.000Z' },
    ],
    invoices: [
      { id: 'invoice_1', workspace_id: previewWorkspace.id, client_id: 'client_1', status: 'draft', description: 'Football game coverage', amount_due_cents: 45000, deposit_cents: 15000, due_date: '2026-08-15', hosted_invoice_url: null, created_at: '2026-07-10T13:00:00.000Z' },
    ],
    inquiries: [
      { id: 'inquiry_1', workspace_id: previewWorkspace.id, name: 'Morgan Lee', email: 'morgan@example.com', phone: null, desired_date: '2026-09-12', message: 'Football coverage for our home game.', status: 'new', created_at: '2026-07-11T12:00:00.000Z' },
    ],
    connect: { onboarding_status: 'pending', charges_enabled: false, payouts_enabled: false, details_submitted: false },
    error: null,
  };
}

export async function loadStudioAdminData(
  client: DataClient | null,
  workspaceSlug = import.meta.env.SITE_WORKSPACE_SLUG ?? 'northline',
): Promise<StudioAdminData> {
  const empty: StudioAdminData = {
    workspace: null, settings: null, galleries: [], images: [], posts: [], services: [],
    clients: [], invoices: [], inquiries: [], connect: null, error: null,
  };
  if (!client) return { ...empty, error: 'The secure studio database is not configured.' };

  const workspaceResult = await client
    .from('client_workspaces')
    .select('id,name,slug,status')
    .eq('slug', workspaceSlug)
    .maybeSingle<StudioWorkspace>();
  if (workspaceResult.error || !workspaceResult.data) {
    return { ...empty, error: 'This studio is not connected to your account.' };
  }
  const workspace = workspaceResult.data;
  const id = workspace.id;
  const [settings, galleries, images, posts, services, clients, invoices, inquiries, connect] = await Promise.all([
    client.from('studio_settings').select('workspace_id,site_title,hero_title,hero_subtitle,contact_email,contact_phone,paper_color,ink_color,accent_color,font_preset').eq('workspace_id', id).maybeSingle<StudioSettings>(),
    client.from('studio_galleries').select('id,workspace_id,title,slug,category,description,cover_image_url,cover_storage_path,status,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_gallery_images').select('id,workspace_id,gallery_id,image_url,alt_text,storage_path,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_posts').select('id,workspace_id,title,slug,excerpt,body,cover_image_url,cover_storage_path,status,published_at,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_services').select('id,workspace_id,name,description,price_type,price_cents,is_active,sort_order').eq('workspace_id', id).order('sort_order'),
    client.from('studio_clients').select('id,workspace_id,service_id,name,email,phone,notes,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('studio_invoices').select('id,workspace_id,client_id,status,description,amount_due_cents,deposit_cents,due_date,hosted_invoice_url,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('studio_inquiries').select('id,workspace_id,name,email,phone,desired_date,message,status,created_at').eq('workspace_id', id).order('created_at', { ascending: false }),
    client.from('connected_payment_accounts').select('onboarding_status,charges_enabled,payouts_enabled,details_submitted').eq('workspace_id', id).maybeSingle<ConnectStatus>(),
  ]);

  const failed = [settings, galleries, images, posts, services, clients, invoices, inquiries, connect]
    .some((result) => Boolean(result.error));
  return {
    workspace,
    settings: settings.data,
    galleries: (galleries.data ?? []) as StudioGallery[],
    images: (images.data ?? []) as StudioImage[],
    posts: (posts.data ?? []) as StudioPost[],
    services: (services.data ?? []) as StudioService[],
    clients: (clients.data ?? []) as StudioClient[],
    invoices: (invoices.data ?? []) as StudioInvoice[],
    inquiries: (inquiries.data ?? []) as StudioInquiry[],
    connect: connect.data,
    error: failed ? 'Some studio records could not be loaded.' : null,
  };
}

export async function resolveManagedStudio(clerkUserId: string) {
  const client = createStudioDatabase();
  if (!client) return { client: null, workspaceId: null };
  const workspace = await client
    .from('client_workspaces')
    .select('id')
    .eq('slug', import.meta.env.SITE_WORKSPACE_SLUG ?? 'northline')
    .maybeSingle<{ id: string }>();
  if (!workspace.data || !(await userCanManageWorkspace(client, clerkUserId, workspace.data.id))) {
    return { client: null, workspaceId: null };
  }
  return { client, workspaceId: workspace.data.id };
}

export async function loadStudioSession(input: {
  isPreview: boolean;
  userId: string | null;
  getToken: () => Promise<string | null>;
}) {
  if (input.isPreview) return { authenticated: true, authorized: true, data: previewStudioData() };
  if (!input.userId) return { authenticated: false, authorized: false, data: null };
  const { client } = await resolveManagedStudio(input.userId);
  if (!client) {
    return { authenticated: true, authorized: false, data: null };
  }
  return { authenticated: true, authorized: true, data: await loadStudioAdminData(client) };
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
