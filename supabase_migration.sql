-- ============================================================
-- CityPulse — Supabase PostgreSQL schema
-- Paste this entire file into Supabase → SQL Editor → Run
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  label text,
  city text,
  latitude double precision,
  longitude double precision,
  radius integer default 800,
  boundary jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.civic_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text,
  title text,
  description text,
  zone_id uuid references public.zones(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  severity text,
  value numeric,
  unit text,
  status text default 'active',
  timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.zones(id) on delete cascade,
  event_type text,
  metric text,
  baseline_value numeric,
  current_value numeric,
  change_percent numeric,
  severity text,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.correlations (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.zones(id) on delete cascade,
  event_a_id uuid,
  event_b_id uuid,
  correlation_type text,
  confidence numeric,
  time_overlap numeric,
  location_overlap numeric,
  explanation text,
  detected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.zones(id) on delete cascade,
  title text,
  summary text,
  severity text,
  confidence numeric,
  insight_type text,
  source_event_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.zones(id) on delete cascade,
  insight_id uuid,
  alert_type text,
  severity text,
  title text,
  message text,
  status text default 'active',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Helper table for the scripted demo scenario cursor
create table if not exists public.sim_state (
  id text primary key,
  step integer not null default 0,
  base_ts timestamptz,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists civic_events_zone_time_idx on public.civic_events(zone_id, timestamp desc);
create index if not exists civic_events_source_idx on public.civic_events(source);
create index if not exists anomalies_zone_idx on public.anomalies(zone_id);
create index if not exists correlations_zone_idx on public.correlations(zone_id);
create index if not exists alerts_zone_idx on public.alerts(zone_id);
create index if not exists insights_zone_idx on public.insights(zone_id);

-- Row Level Security: public civic data is readable by anon.
-- All writes are performed server-side with the secret key (which bypasses RLS).
do $$ declare t text; begin
  foreach t in array array['zones','civic_events','anomalies','correlations','insights','alerts','sim_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Realtime (safe to re-run)
do $$ begin
  begin
    alter publication supabase_realtime add table
      public.civic_events, public.anomalies, public.correlations,
      public.insights, public.alerts;
  exception when duplicate_object then null;
  end;
end $$;
