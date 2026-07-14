export type SiteLifecycleQueryExecutor = (
  text: string,
  values: unknown[],
) => Promise<Record<string, unknown>[]>;

export type SiteLifecycleOperation<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type SiteLifecycleResult = {
  outcome: 'archived' | 'already_archived' | 'restored' | 'not_archived' | 'missing_site';
  workspace_id: string | null;
  site_status: 'archived' | 'maintenance' | null;
};

export type ArchiveSiteInput = {
  workspace_id: string;
  actor: string;
  reason?: string | null;
};

export type RestoreSiteInput = {
  workspace_id: string;
  actor: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_PATTERN = /^[A-Za-z0-9_:-]{3,128}$/;

const archiveSiteSql = `
with actor_context as materialized (
  select set_config('leon.request_actor', $2, true) as "actor"
),
locked_site as materialized (
  select connection."workspace_id", connection."status", connection."pre_archive_status"
  from "site_connections" as connection
  cross join actor_context
  where connection."workspace_id" = $1::uuid
  for update of connection
),
connection_update as materialized (
  update "site_connections" as connection
  set
    "status" = 'archived',
    "pre_archive_status" = case
      when locked_site."status" = 'archived' then connection."pre_archive_status"
      else locked_site."status"
    end,
    "archived_at" = coalesce(connection."archived_at", now()),
    "archived_by_clerk_user_id" = coalesce(connection."archived_by_clerk_user_id", $2),
    "archive_reason" = case
      when locked_site."status" = 'archived' then connection."archive_reason"
      else $3
    end
  from locked_site
  where connection."workspace_id" = locked_site."workspace_id"
  returning connection."workspace_id", connection."status"
),
workspace_update as materialized (
  update "client_workspaces" as workspace
  set "status" = 'closed'
  from locked_site
  where workspace."id" = locked_site."workspace_id"
    and locked_site."status" <> 'archived'
  returning workspace."id"
),
project_update as materialized (
  update "website_projects" as project
  set "status" = 'paused'
  from locked_site
  where project."workspace_id" = locked_site."workspace_id"
    and locked_site."status" <> 'archived'
  returning project."workspace_id"
)
select
  case
    when not exists (select 1 from locked_site) then 'missing_site'
    when (select "status" = 'archived' from locked_site) then 'already_archived'
    else 'archived'
  end as "outcome",
  (select "workspace_id"::text from connection_update limit 1) as "workspace_id",
  (select "status" from connection_update limit 1) as "site_status"
`;

const restoreSiteSql = `
with actor_context as materialized (
  select set_config('leon.request_actor', $2, true) as "actor"
),
locked_site as materialized (
  select connection."workspace_id", connection."status"
  from "site_connections" as connection
  cross join actor_context
  where connection."workspace_id" = $1::uuid
  for update of connection
),
connection_update as materialized (
  update "site_connections" as connection
  set
    "status" = 'maintenance',
    "desired_status" = 'maintenance',
    "archived_at" = null,
    "archived_by_clerk_user_id" = null,
    "archive_reason" = null,
    "pre_archive_status" = null
  from locked_site
  where connection."workspace_id" = locked_site."workspace_id"
    and locked_site."status" = 'archived'
  returning connection."workspace_id", connection."status"
),
workspace_update as materialized (
  update "client_workspaces" as workspace
  set "status" = 'approved'
  from connection_update
  where workspace."id" = connection_update."workspace_id"
  returning workspace."id"
),
project_update as materialized (
  update "website_projects" as project
  set "status" = 'review',
      "next_step" = 'Review the restored site before activation.'
  from connection_update
  where project."workspace_id" = connection_update."workspace_id"
  returning project."workspace_id"
)
select
  case
    when not exists (select 1 from locked_site) then 'missing_site'
    when not exists (select 1 from connection_update) then 'not_archived'
    else 'restored'
  end as "outcome",
  coalesce(
    (select "workspace_id"::text from connection_update limit 1),
    (select "workspace_id"::text from locked_site limit 1)
  ) as "workspace_id",
  coalesce(
    (select "status" from connection_update limit 1),
    (select "status" from locked_site limit 1)
  ) as "site_status"
`;

function validateWorkspaceActor(workspaceId: string, actor: string) {
  if (!UUID_PATTERN.test(workspaceId)) throw new Error('Invalid workspace.');
  if (!ACTOR_PATTERN.test(actor)) throw new Error('Invalid lifecycle actor.');
}

function lifecycleResult(row: Record<string, unknown> | undefined): SiteLifecycleResult | null {
  if (!row) return null;
  return {
    outcome: String(row.outcome) as SiteLifecycleResult['outcome'],
    workspace_id: typeof row.workspace_id === 'string' ? row.workspace_id : null,
    site_status: row.site_status === 'archived' || row.site_status === 'maintenance'
      ? row.site_status
      : null,
  };
}

async function runLifecycleOperation(
  executeQuery: SiteLifecycleQueryExecutor,
  text: string,
  values: unknown[],
): Promise<SiteLifecycleOperation<SiteLifecycleResult>> {
  try {
    const data = lifecycleResult((await executeQuery(text, values))[0]);
    return data
      ? { data, error: null }
      : { data: null, error: { message: 'Site lifecycle state was not returned.' } };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site lifecycle operation failed.' },
    };
  }
}

export async function archiveSite(
  executeQuery: SiteLifecycleQueryExecutor,
  input: ArchiveSiteInput,
): Promise<SiteLifecycleOperation<SiteLifecycleResult>> {
  try {
    validateWorkspaceActor(input.workspace_id, input.actor);
    const reason = input.reason?.trim() || null;
    if (reason && reason.length > 240) throw new Error('Archive reason is too long.');
    return await runLifecycleOperation(executeQuery, archiveSiteSql, [
      input.workspace_id,
      input.actor,
      reason,
    ]);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site archive failed.' },
    };
  }
}

export async function restoreSite(
  executeQuery: SiteLifecycleQueryExecutor,
  input: RestoreSiteInput,
): Promise<SiteLifecycleOperation<SiteLifecycleResult>> {
  try {
    validateWorkspaceActor(input.workspace_id, input.actor);
    return await runLifecycleOperation(executeQuery, restoreSiteSql, [
      input.workspace_id,
      input.actor,
    ]);
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : 'Site restore failed.' },
    };
  }
}
