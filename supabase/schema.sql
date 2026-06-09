create extension if not exists "pgcrypto";

create table if not exists public.subjects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  full_score numeric not null,
  target_score numeric not null,
  color text not null default '#177ddc',
  display_order integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.subjects add column if not exists display_order integer not null default 0;
alter table public.subjects add column if not exists hidden boolean not null default false;

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject_id text not null,
  paper_name text not null,
  score numeric not null,
  full_score numeric not null,
  record_type text not null default 'paper',
  exercise_book_name text not null default '',
  exercise_page text not null default '',
  exercise_question text not null default '',
  duration_minutes integer,
  date date not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.records add column if not exists duration_minutes integer;
alter table public.records add column if not exists record_type text not null default 'paper';
alter table public.records add column if not exists exercise_book_name text not null default '';
alter table public.records add column if not exists exercise_page text not null default '';
alter table public.records add column if not exists exercise_question text not null default '';

create table if not exists public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject_id text not null,
  title text not null,
  knowledge_point text not null default '',
  reason text not null default 'concept',
  status text not null default '待复盘',
  source_record_id uuid references public.records(id) on delete set null,
  question_text text not null default '',
  analysis text not null default '',
  next_review_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mistake_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  mistake_id uuid not null references public.mistakes(id) on delete cascade,
  storage_key text not null,
  public_url text not null,
  file_name text not null,
  mime_type text not null,
  size integer not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

alter table public.subjects enable row level security;
alter table public.records enable row level security;
alter table public.mistakes enable row level security;
alter table public.mistake_images enable row level security;

create policy "subjects owner access" on public.subjects
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "records owner access" on public.records
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "mistakes owner access" on public.mistakes
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "mistake images owner access" on public.mistake_images
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists records_user_date_idx on public.records(user_id, date desc);
create index if not exists mistakes_user_updated_idx on public.mistakes(user_id, updated_at desc);
create index if not exists mistake_images_mistake_idx on public.mistake_images(mistake_id);

alter table public.subjects replica identity full;
alter table public.records replica identity full;
alter table public.mistakes replica identity full;
alter table public.mistake_images replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subjects'
    ) then
      alter publication supabase_realtime add table public.subjects;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
    ) then
      alter publication supabase_realtime add table public.records;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mistakes'
    ) then
      alter publication supabase_realtime add table public.mistakes;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mistake_images'
    ) then
      alter publication supabase_realtime add table public.mistake_images;
    end if;
  end if;
end $$;
