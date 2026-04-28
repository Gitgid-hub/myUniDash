create table if not exists public.user_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_states enable row level security;

drop policy if exists "Users can read own state" on public.user_states;
create policy "Users can read own state"
  on public.user_states
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own state" on public.user_states;
create policy "Users can insert own state"
  on public.user_states
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own state" on public.user_states;
create policy "Users can update own state"
  on public.user_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.catalog_courses (
  id bigint generated always as identity primary key,
  source text not null,
  external_id text not null,
  course_number text not null,
  name_he text,
  name_en text,
  faculty text,
  department text,
  credits numeric(4,2),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists catalog_courses_course_number_idx on public.catalog_courses (course_number);
create index if not exists catalog_courses_name_he_idx on public.catalog_courses using gin (to_tsvector('simple', coalesce(name_he, '')));
create index if not exists catalog_courses_name_en_idx on public.catalog_courses using gin (to_tsvector('simple', coalesce(name_en, '')));

create table if not exists public.catalog_meetings (
  id bigint generated always as identity primary key,
  source text not null,
  course_external_id text not null,
  weekday text not null,
  start_time text not null,
  end_time text not null,
  meeting_type text,
  location text,
  semester text,
  meeting_type_key text generated always as (coalesce(meeting_type, '')) stored,
  location_key text generated always as (coalesce(location, '')) stored,
  semester_key text generated always as (coalesce(semester, '')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, course_external_id, weekday, start_time, end_time, meeting_type_key, location_key, semester_key)
);

create index if not exists catalog_meetings_source_course_idx on public.catalog_meetings (source, course_external_id);

create table if not exists public.catalog_sync_runs (
  id bigint generated always as identity primary key,
  source text not null,
  scope text not null,
  status text not null,
  fetched_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists catalog_sync_runs_source_scope_idx on public.catalog_sync_runs (source, scope, started_at desc);

create table if not exists public.user_imported_courses (
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  external_id text not null,
  imported_at timestamptz not null default now(),
  primary key (user_id, source, external_id)
);

alter table public.catalog_courses enable row level security;
alter table public.catalog_meetings enable row level security;
alter table public.catalog_sync_runs enable row level security;
alter table public.user_imported_courses enable row level security;

drop policy if exists "Authenticated users can read catalog courses" on public.catalog_courses;
create policy "Authenticated users can read catalog courses"
  on public.catalog_courses
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read catalog meetings" on public.catalog_meetings;
create policy "Authenticated users can read catalog meetings"
  on public.catalog_meetings
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read sync runs" on public.catalog_sync_runs;
create policy "Authenticated users can read sync runs"
  on public.catalog_sync_runs
  for select
  to authenticated
  using (true);

drop policy if exists "Users can read own imported courses" on public.user_imported_courses;
create policy "Users can read own imported courses"
  on public.user_imported_courses
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own imported courses" on public.user_imported_courses;
create policy "Users can insert own imported courses"
  on public.user_imported_courses
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create table if not exists public.feature_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null,
  message text not null,
  screenshots jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists feature_requests_created_at_idx on public.feature_requests (created_at desc);
create index if not exists feature_requests_user_id_idx on public.feature_requests (user_id, created_at desc);

alter table public.feature_requests enable row level security;

drop policy if exists "Users can insert own feature requests" on public.feature_requests;
create policy "Users can insert own feature requests"
  on public.feature_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own feature requests" on public.feature_requests;
create policy "Users can read own feature requests"
  on public.feature_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: task file attachments
-- Run once in Supabase Dashboard → SQL Editor, or via Supabase CLI migration.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-attachments',
  'user-attachments',
  false,
  33554432,  -- 32 MB, matches TASK_ATTACHMENT_MAX_BYTES
  null        -- all mime types allowed (validated client-side)
)
on conflict (id) do nothing;

drop policy if exists "Users can upload own attachments" on storage.objects;
create policy "Users can upload own attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'user-attachments' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own attachments" on storage.objects;
create policy "Users can read own attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'user-attachments' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own attachments" on storage.objects;
create policy "Users can update own attachments"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'user-attachments' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own attachments" on storage.objects;
create policy "Users can delete own attachments"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'user-attachments' and
    (storage.foldername(name))[1] = auth.uid()::text
  );
