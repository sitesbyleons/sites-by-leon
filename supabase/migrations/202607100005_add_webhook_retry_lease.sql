alter table app_private.stripe_events
  add column last_attempt_at timestamptz not null default now();

create index stripe_events_retry_idx
  on app_private.stripe_events (status, last_attempt_at)
  where status in ('processing', 'failed');
