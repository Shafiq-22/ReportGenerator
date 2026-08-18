-- =============================================================================
-- Row Level Security
--
-- Internal tool: RLS is an AUTHORIZATION layer (what may this role do?),
-- not a tenant-isolation layer. Base rule:
--   * any active staff member may READ operational data
--   * WRITES are gated by role
--   * only admins manage users, settings and audit history
--
-- The service role (used by the report worker and trusted server code)
-- bypasses RLS entirely by design.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so reading `profiles` inside a policy does
-- not recurse into that table's own RLS.
-- -----------------------------------------------------------------------------
create or replace function current_app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function has_role(roles app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() = any(roles), false)
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select current_app_role() is not null
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_app_role() = 'admin', false)
$$;

create or replace function is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(array['admin', 'project_manager']::app_role[])
$$;

-- Anyone who may create/edit operational content (everyone except viewer).
create or replace function can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(array['admin', 'project_manager', 'field_user']::app_role[])
$$;

-- May the current user mutate rows belonging to this daily report?
-- Authors may edit their own report only while it is still a draft.
create or replace function can_edit_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from daily_reports dr
    where dr.id = p_report_id
      and (
        (dr.author_id = auth.uid() and dr.status = 'draft' and can_write())
        or is_manager()
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table profiles                 enable row level security;
alter table app_settings             enable row level security;
alter table projects                 enable row level security;
alter table project_members          enable row level security;
alter table daily_reports            enable row level security;
alter table activities               enable row level security;
alter table issues                   enable row level security;
alter table manpower                 enable row level security;
alter table equipment                enable row level security;
alter table materials                enable row level security;
alter table attachments              enable row level security;
alter table tags                     enable row level security;
alter table entity_tags              enable row level security;
alter table comments                 enable row level security;
alter table report_templates         enable row level security;
alter table report_template_sections enable row level security;
alter table generated_reports        enable row level security;
alter table report_versions          enable row level security;
alter table report_jobs              enable row level security;
alter table audit_logs               enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy profiles_select on profiles
  for select to authenticated using (is_staff());

-- Users may edit their own profile but NOT their own role or active flag:
-- the new row must keep the role they already have.
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = current_app_role() and is_active);

create policy profiles_admin_all on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

-- -----------------------------------------------------------------------------
-- app_settings
-- -----------------------------------------------------------------------------
create policy app_settings_select on app_settings
  for select to authenticated using (is_staff());

create policy app_settings_admin_update on app_settings
  for update to authenticated using (is_admin()) with check (is_admin());

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create policy projects_select on projects
  for select to authenticated using (is_staff());

create policy projects_insert on projects
  for insert to authenticated with check (is_manager());

create policy projects_update on projects
  for update to authenticated using (is_manager()) with check (is_manager());

create policy projects_delete on projects
  for delete to authenticated using (is_admin());

-- project_members
create policy project_members_select on project_members
  for select to authenticated using (is_staff());

create policy project_members_write on project_members
  for all to authenticated using (is_manager()) with check (is_manager());

-- -----------------------------------------------------------------------------
-- daily_reports
-- -----------------------------------------------------------------------------
create policy daily_reports_select on daily_reports
  for select to authenticated using (is_staff());

create policy daily_reports_insert on daily_reports
  for insert to authenticated with check (can_write() and author_id = auth.uid());

create policy daily_reports_update on daily_reports
  for update to authenticated
  using (
    (author_id = auth.uid() and status = 'draft' and can_write())
    or is_manager()
  )
  with check (
    (author_id = auth.uid() and can_write())
    or is_manager()
  );

create policy daily_reports_delete on daily_reports
  for delete to authenticated using (is_manager());

-- -----------------------------------------------------------------------------
-- Line items — all follow the parent report's editability
-- -----------------------------------------------------------------------------
create policy activities_select on activities
  for select to authenticated using (is_staff());
create policy activities_write on activities
  for all to authenticated
  using (can_edit_report(daily_report_id))
  with check (can_edit_report(daily_report_id));

create policy issues_select on issues
  for select to authenticated using (is_staff());
create policy issues_write on issues
  for all to authenticated
  using (can_edit_report(daily_report_id))
  with check (can_edit_report(daily_report_id));

create policy manpower_select on manpower
  for select to authenticated using (is_staff());
create policy manpower_write on manpower
  for all to authenticated
  using (can_edit_report(daily_report_id))
  with check (can_edit_report(daily_report_id));

create policy equipment_select on equipment
  for select to authenticated using (is_staff());
create policy equipment_write on equipment
  for all to authenticated
  using (can_edit_report(daily_report_id))
  with check (can_edit_report(daily_report_id));

create policy materials_select on materials
  for select to authenticated using (is_staff());
create policy materials_write on materials
  for all to authenticated
  using (can_edit_report(daily_report_id))
  with check (can_edit_report(daily_report_id));

-- -----------------------------------------------------------------------------
-- attachments
-- Project-level files (daily_report_id is null) need write permission only;
-- report-scoped files additionally require the parent report to be editable.
-- -----------------------------------------------------------------------------
create policy attachments_select on attachments
  for select to authenticated using (is_staff());

create policy attachments_insert on attachments
  for insert to authenticated
  with check (
    can_write()
    and (daily_report_id is null or can_edit_report(daily_report_id))
  );

create policy attachments_update on attachments
  for update to authenticated
  using (uploaded_by = auth.uid() or is_manager())
  with check (uploaded_by = auth.uid() or is_manager());

create policy attachments_delete on attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or is_manager());

-- -----------------------------------------------------------------------------
-- tags & comments
-- -----------------------------------------------------------------------------
create policy tags_select on tags
  for select to authenticated using (is_staff());
create policy tags_write on tags
  for all to authenticated using (can_write()) with check (can_write());

create policy entity_tags_select on entity_tags
  for select to authenticated using (is_staff());
create policy entity_tags_write on entity_tags
  for all to authenticated using (can_write()) with check (can_write());

create policy comments_select on comments
  for select to authenticated using (is_staff());
create policy comments_insert on comments
  for insert to authenticated with check (can_write() and author_id = auth.uid());
create policy comments_update on comments
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy comments_delete on comments
  for delete to authenticated using (author_id = auth.uid() or is_admin());

-- -----------------------------------------------------------------------------
-- templates
-- -----------------------------------------------------------------------------
create policy report_templates_select on report_templates
  for select to authenticated using (is_staff());
create policy report_templates_write on report_templates
  for all to authenticated using (is_manager()) with check (is_manager());

create policy report_template_sections_select on report_template_sections
  for select to authenticated using (is_staff());
create policy report_template_sections_write on report_template_sections
  for all to authenticated using (is_manager()) with check (is_manager());

-- -----------------------------------------------------------------------------
-- generated reports / versions / jobs
-- Rows are created by managers; the worker (service role) does the updating.
-- -----------------------------------------------------------------------------
create policy generated_reports_select on generated_reports
  for select to authenticated using (is_staff());
create policy generated_reports_insert on generated_reports
  for insert to authenticated with check (is_manager());
create policy generated_reports_update on generated_reports
  for update to authenticated using (is_manager()) with check (is_manager());
create policy generated_reports_delete on generated_reports
  for delete to authenticated using (is_manager());

create policy report_versions_select on report_versions
  for select to authenticated using (is_staff());
create policy report_versions_insert on report_versions
  for insert to authenticated with check (is_manager());
create policy report_versions_delete on report_versions
  for delete to authenticated using (is_manager());

create policy report_jobs_select on report_jobs
  for select to authenticated using (is_staff());
create policy report_jobs_insert on report_jobs
  for insert to authenticated with check (is_manager());

-- -----------------------------------------------------------------------------
-- audit_logs — readable by admins; written by trusted server code (service role)
-- -----------------------------------------------------------------------------
create policy audit_logs_select on audit_logs
  for select to authenticated using (is_admin());
