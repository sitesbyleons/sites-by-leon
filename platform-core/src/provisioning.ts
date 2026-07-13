import { createHash } from 'node:crypto';

export type ProvisioningTemplateKey = 'blank' | 'sports' | 'editorial' | 'commercial';
export type ProvisioningPlanKey = 'essential' | 'studio' | 'signature';
export type SiteOperationalStatus = 'active' | 'maintenance' | 'paused' | 'error';

export type ProvisionClientSiteInput = {
  idempotency_key: string;
  requested_by_clerk_user_id: string;
  owner_clerk_user_id: string;
  contact_email?: string | null;
  clerk_org_id?: string | null;
  workspace_name: string;
  workspace_slug: string;
  project_name: string;
  plan_key?: ProvisioningPlanKey | null;
  template_key: ProvisioningTemplateKey;
  primary_domain: string;
  admin_domain: string;
  site_key: string;
  deployment_target?: string | null;
  github_repository?: string | null;
  quota_bytes?: number;
  capacity_limit_bytes?: number;
};

export type ProvisionClientSiteResult = {
  workspace_id: string;
  project_id: string;
  workspace_status: string;
  project_status: string;
  site_status: SiteOperationalStatus;
  template_key: ProvisioningTemplateKey;
  primary_domain: string;
  admin_domain: string;
  site_key: string;
};

export type SiteOperationalStatusResult = {
  workspace_id: string;
  site_status: SiteOperationalStatus;
  workspace_status: string | null;
  project_status: string | null;
};

type QueryExecutor = (text: string, values: unknown[]) => Promise<Record<string, unknown>[]>;
type OperationResult<T> = { data: T; error: { message: string } | null };

type NormalizedProvisionInput = {
  idempotencyKey: string;
  requestedByClerkUserId: string;
  ownerClerkUserId: string;
  contactEmail: string | null;
  clerkOrgId: string | null;
  workspaceName: string;
  workspaceSlug: string;
  projectName: string;
  planKey: ProvisioningPlanKey | null;
  templateKey: ProvisioningTemplateKey;
  primaryDomain: string;
  adminDomain: string;
  siteKey: string;
  deploymentTarget: string | null;
  githubRepository: string | null;
  quotaBytes: number;
  capacityLimitBytes: number;
};

const DEFAULT_WORKSPACE_QUOTA_BYTES = 4_294_967_296;
const MIN_WORKSPACE_QUOTA_BYTES = 16_777_216;
const MAX_WORKSPACE_QUOTA_BYTES = 1_099_511_627_776;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CLERK_ID_PATTERN = /^[A-Za-z0-9_:-]{3,128}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const templateKeys = new Set<ProvisioningTemplateKey>(['blank', 'sports', 'editorial', 'commercial']);
const planKeys = new Set<ProvisioningPlanKey>(['essential', 'studio', 'signature']);
const operationalStatuses = new Set<SiteOperationalStatus>(['active', 'maintenance', 'paused', 'error']);

const cleanText = (value: string, minimum: number, maximum: number, message: string) => {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (cleaned.length < minimum || cleaned.length > maximum) throw new Error(message);
  return cleaned;
};

const nullableText = (value: string | null | undefined, maximum: number, message: string) => {
  const cleaned = value?.trim() ?? '';
  if (!cleaned) return null;
  if (cleaned.length > maximum) throw new Error(message);
  return cleaned;
};

function normalizeDomain(value: string, label: 'primary' | 'admin') {
  const original = value.trim();
  const withoutFinalDot = original.endsWith('.') ? original.slice(0, -1) : original;
  const domain = withoutFinalDot.toLowerCase();
  const labels = domain.split('.');
  const valid = domain.length <= 253
    && labels.length >= 2
    && labels.every((part) => part.length >= 1
      && part.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part));
  if (!valid) throw new Error(`Invalid ${label} domain.`);
  return domain;
}

function normalizeProvisionInput(input: ProvisionClientSiteInput): NormalizedProvisionInput {
  if (!UUID_PATTERN.test(input.idempotency_key)) throw new Error('Invalid provisioning request key.');
  if (!CLERK_ID_PATTERN.test(input.requested_by_clerk_user_id)) throw new Error('Invalid requesting administrator.');
  if (!CLERK_ID_PATTERN.test(input.owner_clerk_user_id)) throw new Error('Invalid site owner.');

  const workspaceName = cleanText(input.workspace_name, 2, 100, 'Invalid workspace name.');
  const workspaceSlug = input.workspace_slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(workspaceSlug) || workspaceSlug.length > 100) throw new Error('Invalid workspace slug.');
  const projectName = cleanText(input.project_name, 2, 120, 'Invalid project name.');
  const siteKey = input.site_key.trim().toLowerCase();
  if (!SLUG_PATTERN.test(siteKey) || siteKey.length > 128) throw new Error('Invalid site key.');
  if (!templateKeys.has(input.template_key)) throw new Error('Invalid site template.');

  const planKey = input.plan_key ?? null;
  if (planKey !== null && !planKeys.has(planKey)) throw new Error('Invalid hosting plan.');
  const contactEmail = nullableText(input.contact_email, 254, 'Invalid contact email.');
  if (contactEmail !== null && !EMAIL_PATTERN.test(contactEmail)) throw new Error('Invalid contact email.');
  const clerkOrgId = nullableText(input.clerk_org_id, 128, 'Invalid Clerk organization.');
  if (clerkOrgId !== null && clerkOrgId.length < 3) throw new Error('Invalid Clerk organization.');
  const deploymentTarget = nullableText(input.deployment_target, 240, 'Invalid deployment target.');
  const githubRepository = nullableText(input.github_repository, 201, 'Invalid GitHub repository.');
  if (githubRepository !== null && !REPOSITORY_PATTERN.test(githubRepository)) throw new Error('Invalid GitHub repository.');

  const quotaBytes = input.quota_bytes ?? DEFAULT_WORKSPACE_QUOTA_BYTES;
  if (!Number.isSafeInteger(quotaBytes)
    || quotaBytes < MIN_WORKSPACE_QUOTA_BYTES
    || quotaBytes > MAX_WORKSPACE_QUOTA_BYTES) {
    throw new Error('Invalid workspace storage quota.');
  }
  // Omitting the platform ceiling fails closed once any other quota exists.
  // Production callers should pass the disk-backed platform reservation limit.
  const capacityLimitBytes = input.capacity_limit_bytes ?? quotaBytes;
  if (!Number.isSafeInteger(capacityLimitBytes)
    || capacityLimitBytes < quotaBytes
    || capacityLimitBytes > Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid platform storage capacity.');
  }

  return {
    idempotencyKey: input.idempotency_key.toLowerCase(),
    requestedByClerkUserId: input.requested_by_clerk_user_id,
    ownerClerkUserId: input.owner_clerk_user_id,
    contactEmail,
    clerkOrgId,
    workspaceName,
    workspaceSlug,
    projectName,
    planKey,
    templateKey: input.template_key,
    primaryDomain: normalizeDomain(input.primary_domain, 'primary'),
    adminDomain: normalizeDomain(input.admin_domain, 'admin'),
    siteKey,
    deploymentTarget,
    githubRepository,
    quotaBytes,
    capacityLimitBytes,
  };
}

function themeFor(templateKey: ProvisioningTemplateKey) {
  if (templateKey === 'sports') {
    return { heroSubtitle: 'Sports photography for teams and athletes.', paper: '#f4f6f8', ink: '#090d12', accent: '#ff3b30', font: 'athletic' };
  }
  if (templateKey === 'commercial') {
    return { heroSubtitle: 'Commercial photography and project inquiries.', paper: '#f5f3ee', ink: '#11100e', accent: '#b46b37', font: 'modern' };
  }
  if (templateKey === 'editorial') {
    return { heroSubtitle: 'Photography, galleries, and booking information.', paper: '#f7f3eb', ink: '#17130f', accent: '#8d5d46', font: 'editorial' };
  }
  return { heroSubtitle: 'Photography portfolio and booking information.', paper: '#f4f6f8', ink: '#090d12', accent: '#3f5f77', font: 'editorial' };
}

function starterContent(templateKey: ProvisioningTemplateKey) {
  const sportsImageUrls = [
    '/images/sports/football-huddle.webp',
    '/images/sports/football-player.webp',
    '/images/sports/football-field.webp',
  ];
  if (templateKey === 'sports') {
    const imageUrls = sportsImageUrls;
    return {
      services: [
        { name: 'Game Coverage', description: 'Photography coverage for one game.', price_type: 'from', price_cents: 45000, sort_order: 1 },
        { name: 'Athlete Session', description: 'Action photography and athlete portraits.', price_type: 'from', price_cents: 60000, sort_order: 2 },
      ],
      gallery: { title: 'Game Day', slug: 'game-day', category: 'Sports', description: 'Selected game coverage.', cover_image_url: imageUrls[0] },
      images: [
        { image_url: imageUrls[0], alt_text: 'Football teams lined up during a night game', sort_order: 1 },
        { image_url: imageUrls[1], alt_text: 'Quarterback preparing to pass during a football game', sort_order: 2 },
        { image_url: imageUrls[2], alt_text: 'Football action under stadium lights', sort_order: 3 },
      ],
      post: { title: 'Recent Game', slug: 'recent-game', excerpt: 'Selected photographs from a recent game.', body: 'A short collection of recent game photographs.', cover_image_url: imageUrls[1] },
    };
  }
  if (templateKey === 'commercial') {
    const imageUrls = [
      '/images/cinematic/commercial-audio.webp',
      '/images/cinematic/commercial-fragrance.webp',
      '/images/cinematic/commercial-jewelry.webp',
    ];
    return {
      services: [
        { name: 'Half-Day Production', description: 'A focused commercial photography session.', price_type: 'custom', price_cents: null, sort_order: 1 },
        { name: 'Full-Day Production', description: 'Full-day campaign or product photography.', price_type: 'custom', price_cents: null, sort_order: 2 },
      ],
      gallery: { title: 'Selected Work', slug: 'selected-work', category: 'Commercial', description: 'Recent commissioned photography.', cover_image_url: imageUrls[0] },
      images: [
        { image_url: imageUrls[0], alt_text: 'Audio equipment photographed for a commercial campaign', sort_order: 1 },
        { image_url: imageUrls[1], alt_text: 'Fragrance bottle photographed for a commercial campaign', sort_order: 2 },
        { image_url: imageUrls[2], alt_text: 'Jewelry photographed for a commercial campaign', sort_order: 3 },
      ],
      post: { title: 'Recent Commission', slug: 'recent-commission', excerpt: 'A short look at a recent photography commission.', body: 'Selected work and production notes from a recent commission.', cover_image_url: imageUrls[1] },
    };
  }
  if (templateKey === 'editorial') {
    const imageUrls = [
      '/images/cinematic/wedding-courthouse.webp',
      '/images/cinematic/wedding-dance.webp',
      '/images/cinematic/wedding-window.webp',
    ];
    return {
      services: [
        { name: 'Portrait Session', description: 'A planned portrait photography session.', price_type: 'from', price_cents: 50000, sort_order: 1 },
        { name: 'Event Coverage', description: 'Photography coverage for an event or celebration.', price_type: 'custom', price_cents: null, sort_order: 2 },
      ],
      gallery: { title: 'Recent Stories', slug: 'recent-stories', category: 'Editorial', description: 'Selected photographs from recent stories.', cover_image_url: imageUrls[0] },
      images: [
        { image_url: imageUrls[0], alt_text: 'Wedding portrait outside a courthouse', sort_order: 1 },
        { image_url: imageUrls[1], alt_text: 'Couple dancing during their wedding reception', sort_order: 2 },
        { image_url: imageUrls[2], alt_text: 'Wedding portrait beside a window', sort_order: 3 },
      ],
      post: { title: 'Recent Story', slug: 'recent-story', excerpt: 'A recent photography story.', body: 'A short introduction to a recent photography story.', cover_image_url: imageUrls[1] },
    };
  }
  const imageUrls = sportsImageUrls;
  return {
    services: [
      { name: 'Photography Session', description: 'A custom photography session.', price_type: 'custom', price_cents: null, sort_order: 1 },
      { name: 'Event Coverage', description: 'Photography coverage for an event.', price_type: 'custom', price_cents: null, sort_order: 2 },
    ],
    gallery: { title: 'Featured Work', slug: 'featured-work', category: 'Portfolio', description: 'A starting gallery ready to customize.', cover_image_url: imageUrls[0] },
    images: [
      { image_url: imageUrls[0], alt_text: 'First photograph in the featured gallery', sort_order: 1 },
      { image_url: imageUrls[1], alt_text: 'Second photograph in the featured gallery', sort_order: 2 },
      { image_url: imageUrls[2], alt_text: 'Third photograph in the featured gallery', sort_order: 3 },
    ],
    post: { title: 'First Update', slug: 'first-update', excerpt: 'A first studio update ready to edit.', body: 'Replace this text with a short update about recent work.', cover_image_url: imageUrls[1] },
  };
}

function requestFingerprint(input: NormalizedProvisionInput) {
  const fingerprintInput = {
    idempotencyKey: input.idempotencyKey,
    requestedByClerkUserId: input.requestedByClerkUserId,
    ownerClerkUserId: input.ownerClerkUserId,
    contactEmail: input.contactEmail,
    clerkOrgId: input.clerkOrgId,
    workspaceName: input.workspaceName,
    workspaceSlug: input.workspaceSlug,
    projectName: input.projectName,
    planKey: input.planKey,
    templateKey: input.templateKey,
    primaryDomain: input.primaryDomain,
    adminDomain: input.adminDomain,
    siteKey: input.siteKey,
    deploymentTarget: input.deploymentTarget,
    githubRepository: input.githubRepository,
    quotaBytes: input.quotaBytes,
  };
  return createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');
}

const provisioningSql = `
with
input_locks as materialized (
  select pg_advisory_xact_lock(hashtextextended(lock_name, 0))
  from (
    select distinct lock_name
    from unnest(array[$1, $15, $16]::text[]) as requested_lock(lock_name)
  ) as ordered_locks
  order by lock_name
),
lock_barrier as materialized (
  select count(*) as lock_count from input_locks
),
existing_request as materialized (
  select run."workspace_id", run."request_fingerprint"
  from "site_provisioning_runs" as run
  cross join lock_barrier
  where run."idempotency_key" = $2::uuid
),
domain_conflict as materialized (
  select connection."workspace_id"
  from "site_connections" as connection
  cross join lock_barrier
  where (
    not exists (select 1 from existing_request)
    or connection."workspace_id" <> (select "workspace_id" from existing_request limit 1)
  )
  and (
    lower(connection."primary_domain") in ($15, $16)
    or lower(connection."admin_domain") in ($15, $16)
  )
  limit 1
),
capacity as materialized (
  select coalesce(sum("quota_bytes"), 0)::bigint as reserved_bytes
  from "workspace_storage_usage"
  cross join lock_barrier
),
request_row as (
  insert into "site_provisioning_runs" (
    "idempotency_key", "request_fingerprint", "workspace_id",
    "requested_by_clerk_user_id", "owner_clerk_user_id", "status", "last_attempt_at"
  )
  select $2::uuid, $3, gen_random_uuid(), $4, $5, 'database_ready', now()
  from capacity
  where (
    exists (
      select 1 from existing_request
      where "request_fingerprint" = $3
    )
    or capacity.reserved_bytes + $13::bigint <= $14::bigint
  )
  and not exists (select 1 from domain_conflict)
  on conflict ("idempotency_key") do update
  set "last_attempt_at" = now()
  where "site_provisioning_runs"."request_fingerprint" = excluded."request_fingerprint"
  returning "workspace_id", "created_at", "last_attempt_at"
),
workspace_insert as (
  insert into "client_workspaces" (
    "id", "clerk_org_id", "name", "slug", "status"
  )
  select request_row."workspace_id", $8, $6, $7, 'approved'
  from request_row
  on conflict ("id") do nothing
  returning "id", "status"
),
workspace_row as materialized (
  select "id", "status" from workspace_insert
  union all
  select workspace."id", workspace."status"
  from "client_workspaces" as workspace
  join request_row on request_row."workspace_id" = workspace."id"
  where not exists (select 1 from workspace_insert)
),
member_insert as (
  insert into "workspace_members" ("workspace_id", "clerk_user_id", "role")
  select workspace_row."id", $5, 'owner'
  from workspace_row
  on conflict ("workspace_id", "clerk_user_id") do nothing
  returning "id"
),
project_insert as (
  insert into "website_projects" (
    "workspace_id", "name", "status", "plan_key", "progress", "next_step", "template_key"
  )
  select workspace_row."id", $9, 'onboarding', $10, 0,
    'Add the studio details and first gallery.', $11
  from workspace_row
  on conflict ("workspace_id") do nothing
  returning "id", "workspace_id", "status", "template_key"
),
project_row as materialized (
  select "id", "workspace_id", "status", "template_key" from project_insert
  union all
  select project."id", project."workspace_id", project."status", project."template_key"
  from "website_projects" as project
  join workspace_row on workspace_row."id" = project."workspace_id"
  where not exists (select 1 from project_insert)
),
settings_insert as (
  insert into "studio_settings" (
    "workspace_id", "site_title", "hero_title", "hero_subtitle", "contact_email",
    "paper_color", "ink_color", "accent_color", "font_preset"
  )
  select workspace_row."id", $6, $6, $20, $12, $21, $22, $23, $24
  from workspace_row
  on conflict ("workspace_id") do nothing
  returning "workspace_id"
),
storage_insert as (
  insert into "workspace_storage_usage" ("workspace_id", "used_bytes", "quota_bytes")
  select workspace_row."id", 0, $13::bigint
  from workspace_row
  on conflict ("workspace_id") do nothing
  returning "workspace_id"
),
starter_services_insert as (
  insert into "studio_services" (
    "workspace_id", "name", "description", "price_type", "price_cents", "is_active", "sort_order"
  )
  select workspace_row."id", starter."name", starter."description", starter."price_type",
    starter."price_cents", true, starter."sort_order"
  from request_row
  join workspace_row on workspace_row."id" = request_row."workspace_id"
  cross join jsonb_to_recordset($25::jsonb) as starter(
    "name" text, "description" text, "price_type" text, "price_cents" integer, "sort_order" integer
  )
  where request_row."created_at" = request_row."last_attempt_at"
  returning "id"
),
starter_gallery_insert as (
  insert into "studio_galleries" (
    "workspace_id", "title", "slug", "category", "description",
    "cover_image_url", "status", "sort_order"
  )
  select workspace_row."id", starter."title", starter."slug", starter."category",
    starter."description", starter."cover_image_url", 'published', 1
  from request_row
  join workspace_row on workspace_row."id" = request_row."workspace_id"
  cross join jsonb_to_record($26::jsonb) as starter(
    "title" text, "slug" text, "category" text, "description" text, "cover_image_url" text
  )
  where request_row."created_at" = request_row."last_attempt_at"
  returning "id", "workspace_id"
),
starter_images_insert as (
  insert into "studio_gallery_images" (
    "workspace_id", "gallery_id", "image_url", "alt_text", "sort_order"
  )
  select gallery."workspace_id", gallery."id", starter."image_url",
    starter."alt_text", starter."sort_order"
  from starter_gallery_insert as gallery
  cross join jsonb_to_recordset($27::jsonb) as starter(
    "image_url" text, "alt_text" text, "sort_order" integer
  )
  returning "id"
),
starter_post_insert as (
  insert into "studio_posts" (
    "workspace_id", "title", "slug", "excerpt", "body", "cover_image_url",
    "status", "published_at", "sort_order"
  )
  select workspace_row."id", starter."title", starter."slug", starter."excerpt",
    starter."body", starter."cover_image_url", 'published', now(), 1
  from request_row
  join workspace_row on workspace_row."id" = request_row."workspace_id"
  cross join jsonb_to_record($28::jsonb) as starter(
    "title" text, "slug" text, "excerpt" text, "body" text, "cover_image_url" text
  )
  where request_row."created_at" = request_row."last_attempt_at"
  returning "id"
),
site_insert as (
  insert into "site_connections" (
    "workspace_id", "site_key", "primary_domain", "admin_domain",
    "deployment_target", "github_repository", "status"
  )
  select workspace_row."id", $17, $15, $16, $18, $19, 'maintenance'
  from workspace_row
  on conflict ("workspace_id") do nothing
  returning "workspace_id", "site_key", "primary_domain", "admin_domain", "status"
),
site_row as materialized (
  select "workspace_id", "site_key", "primary_domain", "admin_domain", "status" from site_insert
  union all
  select connection."workspace_id", connection."site_key", connection."primary_domain",
    connection."admin_domain", connection."status"
  from "site_connections" as connection
  join workspace_row on workspace_row."id" = connection."workspace_id"
  where not exists (select 1 from site_insert)
),
success_row as materialized (
  select
    workspace_row."id" as workspace_id,
    project_row."id" as project_id,
    workspace_row."status" as workspace_status,
    project_row."status" as project_status,
    site_row."status" as site_status,
    project_row."template_key" as template_key,
    site_row."primary_domain" as primary_domain,
    site_row."admin_domain" as admin_domain,
    site_row."site_key" as site_key
  from request_row
  join workspace_row on workspace_row."id" = request_row."workspace_id"
  join project_row on project_row."workspace_id" = workspace_row."id"
  join site_row on site_row."workspace_id" = workspace_row."id"
)
select success_row.*, null::text as provisioning_error
from success_row
union all
select
  null::uuid as workspace_id,
  null::uuid as project_id,
  null::text as workspace_status,
  null::text as project_status,
  null::text as site_status,
  null::text as template_key,
  null::text as primary_domain,
  null::text as admin_domain,
  null::text as site_key,
  case
    when exists (select 1 from existing_request where "request_fingerprint" <> $3)
      then 'idempotency_conflict'
    when exists (select 1 from domain_conflict)
      then 'domain_conflict'
    else 'capacity_exceeded'
  end as provisioning_error
where not exists (select 1 from success_row)
limit 1
`;

export async function provisionClientSite(
  executeQuery: QueryExecutor,
  input: ProvisionClientSiteInput,
): Promise<OperationResult<ProvisionClientSiteResult | null>> {
  try {
    const normalized = normalizeProvisionInput(input);
    const theme = themeFor(normalized.templateKey);
    const starter = starterContent(normalized.templateKey);
    const fingerprint = requestFingerprint(normalized);
    const rows = await executeQuery(provisioningSql, [
      'provisioning:platform-storage-capacity',
      normalized.idempotencyKey,
      fingerprint,
      normalized.requestedByClerkUserId,
      normalized.ownerClerkUserId,
      normalized.workspaceName,
      normalized.workspaceSlug,
      normalized.clerkOrgId,
      normalized.projectName,
      normalized.planKey,
      normalized.templateKey,
      normalized.contactEmail,
      normalized.quotaBytes,
      normalized.capacityLimitBytes,
      normalized.primaryDomain,
      normalized.adminDomain,
      normalized.siteKey,
      normalized.deploymentTarget,
      normalized.githubRepository,
      theme.heroSubtitle,
      theme.paper,
      theme.ink,
      theme.accent,
      theme.font,
      starter.services,
      starter.gallery,
      starter.images,
      starter.post,
    ]);
    const row = rows[0];
    const errorCode = typeof row?.provisioning_error === 'string' ? row.provisioning_error : null;
    if (errorCode === 'capacity_exceeded') {
      return { data: null, error: { message: 'The platform does not have enough reserved storage for this site.' } };
    }
    if (errorCode === 'domain_conflict') {
      return { data: null, error: { message: 'A site already uses one of these domains.' } };
    }
    if (errorCode === 'idempotency_conflict' || !row) {
      return { data: null, error: { message: 'This provisioning request conflicts with an earlier request.' } };
    }
    return {
      data: {
        workspace_id: String(row.workspace_id),
        project_id: String(row.project_id),
        workspace_status: String(row.workspace_status),
        project_status: String(row.project_status),
        site_status: String(row.site_status) as SiteOperationalStatus,
        template_key: String(row.template_key) as ProvisioningTemplateKey,
        primary_domain: String(row.primary_domain),
        admin_domain: String(row.admin_domain),
        site_key: String(row.site_key),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site provisioning failed.' },
    };
  }
}

const operationalStatusSql = `
with locked_site as materialized (
  select "workspace_id"
  from "site_connections"
  where "workspace_id" = $1::uuid
  for update
),
connection_update as (
  update "site_connections" as connection
  set "status" = $2
  from locked_site
  where connection."workspace_id" = locked_site."workspace_id"
  returning connection."workspace_id", connection."status"
),
workspace_update as (
  update "client_workspaces" as workspace
  set "status" = case when $2 = 'active' then 'active' else 'paused' end
  from locked_site
  where workspace."id" = locked_site."workspace_id"
    and $2 in ('active', 'paused')
  returning workspace."id", workspace."status"
),
project_update as (
  update "website_projects" as project
  set "status" = case when $2 = 'active' then 'live' else 'paused' end,
      "progress" = case when $2 = 'active' then 100 else project."progress" end,
      "next_step" = case when $2 = 'active' then null else project."next_step" end
  from locked_site
  where project."workspace_id" = locked_site."workspace_id"
    and $2 in ('active', 'paused')
  returning project."workspace_id", project."status"
),
provisioning_update as (
  update "site_provisioning_runs"
  set "status" = 'ready',
      "last_error" = null,
      "last_attempt_at" = now()
  from locked_site
  where "site_provisioning_runs"."workspace_id" = locked_site."workspace_id"
    and $2 = 'active'
  returning "site_provisioning_runs"."workspace_id"
)
select
  connection_update."workspace_id",
  connection_update."status" as site_status,
  coalesce(
    (select "status" from workspace_update limit 1),
    (select workspace."status" from "client_workspaces" as workspace
      where workspace."id" = connection_update."workspace_id")
  ) as workspace_status,
  coalesce(
    (select "status" from project_update limit 1),
    (select project."status" from "website_projects" as project
      where project."workspace_id" = connection_update."workspace_id" limit 1)
  ) as project_status
from connection_update
`;

export async function setSiteOperationalStatus(
  executeQuery: QueryExecutor,
  workspaceId: string,
  status: SiteOperationalStatus,
): Promise<OperationResult<SiteOperationalStatusResult | null>> {
  if (!UUID_PATTERN.test(workspaceId)) return { data: null, error: { message: 'Invalid workspace.' } };
  if (!operationalStatuses.has(status)) return { data: null, error: { message: 'Invalid site status.' } };
  try {
    const rows = await executeQuery(operationalStatusSql, [workspaceId, status]);
    const row = rows[0];
    if (!row) return { data: null, error: null };
    return {
      data: {
        workspace_id: String(row.workspace_id),
        site_status: String(row.site_status) as SiteOperationalStatus,
        workspace_status: typeof row.workspace_status === 'string' ? row.workspace_status : null,
        project_status: typeof row.project_status === 'string' ? row.project_status : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site status update failed.' },
    };
  }
}
