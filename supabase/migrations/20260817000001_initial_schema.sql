-- =============================================================================
-- Report Generator — initial schema
--
-- Internal single-company tool: there is no organization/tenant column.
-- Authorization is by `role` on `profiles`, enforced by RLS (see 000002).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type app_role        as enum ('admin', 'project_manager', 'field_user', 'viewer');
create type project_status  as enum ('active', 'on_hold', 'completed', 'archived');
create type report_status   as enum ('draft', 'submitted', 'approved', 'rejected');
create type issue_severity  as enum ('low', 'medium', 'high', 'critical');
create type issue_status    as enum ('open', 'monitoring', 'resolved');
create type attachment_kind as enum ('photo', 'document', 'other');
create type section_type    as enum (
  'cover', 'summary', 'activities', 'issues', 'manpower',
  'equipment', 'materials', 'photos', 'documents', 'custom'
);
create type job_status      as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type report_format   as enum ('pdf', 'docx');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  avatar_path text,
  role        app_role not null default 'field_user',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_role_idx on profiles (role) where is_active;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile whenever an auth user is created.
-- The very first user to sign up becomes the admin so the system is usable
-- from a cold start; everyone after that starts as a field user.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when is_first then 'admin'::app_role else 'field_user'::app_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- Company settings (exactly one row)
-- -----------------------------------------------------------------------------
create table app_settings (
  id           boolean primary key default true check (id),
  company_name text not null default 'Company',
  logo_path    text,
  settings     jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

insert into app_settings (id) values (true);

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------
create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,
  description text,
  client_name text,
  location    text,
  status      project_status not null default 'active',
  start_date  date,
  end_date    date,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_date_order check (end_date is null or start_date is null or end_date >= start_date)
);
create index projects_status_idx on projects (status, updated_at desc);

create trigger projects_set_updated_at
  before update on projects
  for each row execute function set_updated_at();

-- Assignment metadata only — not a security boundary.
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

-- -----------------------------------------------------------------------------
-- Daily reports
-- -----------------------------------------------------------------------------
create table daily_reports (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  report_date  date not null,
  author_id    uuid not null references profiles(id) on delete cascade,
  status       report_status not null default 'draft',
  weather      text,
  temperature  numeric,
  summary      text,
  location     text,
  submitted_at timestamptz,
  approved_by  uuid references profiles(id) on delete set null,
  approved_at  timestamptz,
  autosaved_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, report_date, author_id)
);
create index daily_reports_project_date_idx on daily_reports (project_id, report_date desc);
create index daily_reports_submitted_idx    on daily_reports (status) where status = 'submitted';
create index daily_reports_author_idx       on daily_reports (author_id, report_date desc);

create trigger daily_reports_set_updated_at
  before update on daily_reports
  for each row execute function set_updated_at();

-- Line items ------------------------------------------------------------------
create table activities (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references daily_reports(id) on delete cascade,
  title            text not null,
  description      text,
  category         text,
  percent_complete int check (percent_complete between 0 and 100),
  sort_order       int not null default 0
);
create index activities_report_idx on activities (daily_report_id, sort_order);

create table issues (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  title           text not null,
  description     text,
  severity        issue_severity not null default 'medium',
  status          issue_status not null default 'open',
  delay_days      numeric check (delay_days >= 0),
  resolved_at     timestamptz,
  sort_order      int not null default 0
);
create index issues_report_idx on issues (daily_report_id, sort_order);
create index issues_open_idx   on issues (status) where status <> 'resolved';

create table manpower (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  trade           text not null,
  contractor      text,
  headcount       int not null default 0 check (headcount >= 0),
  hours           numeric check (hours >= 0),
  notes           text,
  sort_order      int not null default 0
);
create index manpower_report_idx on manpower (daily_report_id, sort_order);

create table equipment (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  name            text not null,
  quantity        int not null default 1 check (quantity >= 0),
  hours_used      numeric check (hours_used >= 0),
  status          text,
  notes           text,
  sort_order      int not null default 0
);
create index equipment_report_idx on equipment (daily_report_id, sort_order);

create table materials (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references daily_reports(id) on delete cascade,
  name            text not null,
  quantity        numeric,
  unit            text,
  supplier        text,
  notes           text,
  sort_order      int not null default 0
);
create index materials_report_idx on materials (daily_report_id, sort_order);

-- -----------------------------------------------------------------------------
-- Attachments (photos + documents in one table)
-- -----------------------------------------------------------------------------
create table attachments (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  daily_report_id uuid references daily_reports(id) on delete cascade,
  kind            attachment_kind not null default 'other',
  bucket          text not null,
  storage_path    text not null,
  thumbnail_path  text,
  file_name       text not null,
  mime_type       text not null,
  size_bytes      bigint not null check (size_bytes >= 0),
  width           int,
  height          int,
  taken_at        timestamptz,
  caption         text,
  sort_order      int not null default 0,
  uploaded_by     uuid references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index attachments_report_idx  on attachments (daily_report_id, sort_order);
create index attachments_project_idx on attachments (project_id, kind, created_at desc);

-- security_invoker keeps the caller's RLS in force when reading through the view.
create view photos with (security_invoker = on) as
  select * from attachments where kind = 'photo';

-- -----------------------------------------------------------------------------
-- Tags & comments
-- -----------------------------------------------------------------------------
create table tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  color text
);

create table entity_tags (
  tag_id      uuid not null references tags(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  primary key (tag_id, entity_type, entity_id)
);
create index entity_tags_entity_idx on entity_tags (entity_type, entity_id);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   uuid not null,
  author_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index comments_entity_idx on comments (entity_type, entity_id, created_at);

-- -----------------------------------------------------------------------------
-- Report templates
-- -----------------------------------------------------------------------------
create table report_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_default  boolean not null default false,
  config      jsonb not null default '{}',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index report_templates_one_default on report_templates (is_default) where is_default;

create trigger report_templates_set_updated_at
  before update on report_templates
  for each row execute function set_updated_at();

create table report_template_sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references report_templates(id) on delete cascade,
  section_type section_type not null,
  title        text,
  sort_order   int not null default 0,
  config       jsonb not null default '{}',
  enabled      boolean not null default true
);
create index report_template_sections_idx on report_template_sections (template_id, sort_order);

-- -----------------------------------------------------------------------------
-- Generated reports, versions, jobs
-- -----------------------------------------------------------------------------
create table generated_reports (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  template_id uuid references report_templates(id) on delete set null,
  title       text not null,
  date_from   date not null,
  date_to     date not null,
  filters     jsonb not null default '{}',
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint generated_reports_date_order check (date_to >= date_from)
);
create index generated_reports_project_idx on generated_reports (project_id, created_at desc);

create table report_versions (
  id                  uuid primary key default gen_random_uuid(),
  generated_report_id uuid not null references generated_reports(id) on delete cascade,
  version_no          int not null,
  format              report_format not null default 'pdf',
  storage_path        text,
  size_bytes          bigint,
  page_count          int,
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (generated_report_id, version_no, format)
);
create index report_versions_report_idx on report_versions (generated_report_id, version_no desc);

create table report_jobs (
  id                  uuid primary key default gen_random_uuid(),
  generated_report_id uuid not null references generated_reports(id) on delete cascade,
  report_version_id   uuid references report_versions(id) on delete cascade,
  format              report_format not null default 'pdf',
  status              job_status not null default 'queued',
  progress            int not null default 0 check (progress between 0 and 100),
  step                text,
  error               text,
  attempts            int not null default 0,
  locked_at           timestamptz,
  started_at          timestamptz,
  finished_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index report_jobs_pending_idx on report_jobs (status, created_at)
  where status in ('queued', 'processing');
create index report_jobs_report_idx on report_jobs (generated_report_id, created_at desc);

-- Realtime progress updates for the builder's progress bar.
alter publication supabase_realtime add table report_jobs;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_entity_idx  on audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Default report template (needed for the app to work out of the box)
-- -----------------------------------------------------------------------------
do $$
declare
  tpl_id uuid;
begin
  insert into report_templates (name, description, is_default, config)
  values (
    'Standard Project Report',
    'Default layout: cover, summary, activities, issues, resources, photo appendix, documents.',
    true,
    '{"pageSize":"A4","accentColor":"#1f5fa9","showPageNumbers":true}'
  )
  returning id into tpl_id;

  insert into report_template_sections (template_id, section_type, title, sort_order, config) values
    (tpl_id, 'cover',      'Cover',              0, '{}'),
    (tpl_id, 'summary',    'Executive Summary',  1, '{"groupBy":"day"}'),
    (tpl_id, 'activities', 'Work Activities',    2, '{"groupBy":"day"}'),
    (tpl_id, 'issues',     'Issues & Delays',    3, '{"includeResolved":true}'),
    (tpl_id, 'manpower',   'Manpower',           4, '{"mode":"summary"}'),
    (tpl_id, 'equipment',  'Equipment',          5, '{"mode":"summary"}'),
    (tpl_id, 'materials',  'Materials',          6, '{"mode":"summary"}'),
    (tpl_id, 'photos',     'Photo Appendix',     7, '{"columns":2,"showCaptions":true,"placement":"appendix"}'),
    (tpl_id, 'documents',  'Supporting Documents', 8, '{"mode":"index"}');
end $$;
