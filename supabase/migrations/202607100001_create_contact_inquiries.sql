create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) between 3 and 254),
  focus text not null check (char_length(focus) between 2 and 80),
  message text not null check (char_length(message) between 20 and 2000),
  ip_hash text not null check (char_length(ip_hash) = 64)
);

comment on table public.contact_inquiries is
  'Private website inquiries inserted only by the server-side contact Edge Function.';

alter table public.contact_inquiries enable row level security;

revoke all on table public.contact_inquiries from anon, authenticated;

create index if not exists contact_inquiries_rate_limit_idx
  on public.contact_inquiries (ip_hash, created_at desc);
