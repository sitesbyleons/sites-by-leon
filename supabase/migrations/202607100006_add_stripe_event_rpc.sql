create or replace function public.claim_stripe_event(
  p_event_id text,
  p_event_type text,
  p_retry_after_seconds integer default 300
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_status text;
  existing_attempt_count integer;
  existing_last_attempt_at timestamptz;
  retry_after interval;
begin
  if coalesce(((select auth.jwt()) ->> 'role'), '') <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required.';
  end if;

  if char_length(p_event_id) not between 8 and 255
    or char_length(p_event_type) not between 3 and 255 then
    raise data_exception using message = 'Invalid Stripe event identity.';
  end if;

  retry_after := make_interval(secs => least(greatest(p_retry_after_seconds, 30), 3600));

  insert into app_private.stripe_events (
    event_id,
    event_type,
    status,
    last_attempt_at
  )
  values (
    p_event_id,
    p_event_type,
    'processing',
    now()
  )
  on conflict (event_id) do nothing;

  if found then
    return 'claimed';
  end if;

  select status, attempt_count, last_attempt_at
  into existing_status, existing_attempt_count, existing_last_attempt_at
  from app_private.stripe_events
  where event_id = p_event_id
  for update;

  if existing_status = 'processed' then
    return 'duplicate';
  end if;

  if existing_status = 'processing'
    and existing_last_attempt_at > now() - retry_after then
    return 'busy';
  end if;

  update app_private.stripe_events
  set
    status = 'processing',
    attempt_count = existing_attempt_count + 1,
    last_attempt_at = now(),
    last_error = null
  where event_id = p_event_id;

  return 'claimed';
end;
$$;

revoke all on function public.claim_stripe_event(text, text, integer)
from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, integer)
to service_role;

create or replace function public.finish_stripe_event(
  p_event_id text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(((select auth.jwt()) ->> 'role'), '') <> 'service_role' then
    raise insufficient_privilege using message = 'Service role required.';
  end if;

  update app_private.stripe_events
  set
    status = case when p_error is null then 'processed' else 'failed' end,
    processed_at = case when p_error is null then now() else null end,
    last_error = case when p_error is null then null else left(p_error, 1000) end
  where event_id = p_event_id;

  if not found then
    raise no_data_found using message = 'Stripe event was not claimed.';
  end if;
end;
$$;

revoke all on function public.finish_stripe_event(text, text)
from public, anon, authenticated;
grant execute on function public.finish_stripe_event(text, text)
to service_role;
