-- =============================================================================
-- RLS behaviour tests
--
-- Security is the one thing we refuse to assume. These run the real migrations
-- against a real PostgreSQL instance and assert what each role can and cannot
-- do. Any FAIL aborts with a non-zero exit code, so CI blocks the merge.
--
-- Run with:  ./scripts/test-db.sh
-- =============================================================================

\set ON_ERROR_STOP on

-- Supabase grants these to `authenticated` by default; replicate them here so
-- the test exercises RLS rather than missing table grants.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- A regular table (not TEMP) so it stays writable after `set role authenticated`.
create table _results (seq serial, result text);
grant all on _results to authenticated;
grant all on sequence _results_seq_seq to authenticated;

create or replace function as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end $$;

/** Asserts a statement is blocked — either rejected outright or affecting no rows. */
create or replace function expect_denied(label text, stmt text) returns text
language plpgsql as $$
declare affected int;
begin
  execute stmt;
  get diagnostics affected = row_count;
  if affected = 0 then return format('PASS  %s (0 rows affected)', label);
  else return format('FAIL  %s (affected %s rows!)', label, affected);
  end if;
exception when insufficient_privilege or check_violation then
  return format('PASS  %s (rejected by RLS)', label);
end $$;

create or replace function expect_allowed(label text, stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return format('PASS  %s', label);
exception when others then
  return format('FAIL  %s (%s)', label, sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures. The signup trigger makes the first user an admin.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'boss@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'field@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'viewer@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'other@example.com');

insert into _results (result)
select case
  when (select role from profiles where id = '00000000-0000-0000-0000-000000000001') = 'admin'
    then 'PASS  first user becomes admin'
  else 'FAIL  first user should become admin'
end;

insert into _results (result)
select case
  when (select role from profiles where id = '00000000-0000-0000-0000-000000000002') = 'field_user'
    then 'PASS  later users become field users'
  else 'FAIL  later users should become field users'
end;

update profiles set role = 'viewer'     where id = '00000000-0000-0000-0000-000000000003';
update profiles set role = 'field_user' where id = '00000000-0000-0000-0000-000000000004';

insert into projects (id, name, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Test Bridge', '00000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- A field user works on their own draft
-- ---------------------------------------------------------------------------
set role authenticated;
do $$ begin perform as_user('00000000-0000-0000-0000-000000000002'); end $$;

insert into _results (result) select expect_allowed('field_user inserts own daily report',
  $q$insert into daily_reports (id, project_id, report_date, author_id)
     values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','2026-03-01','00000000-0000-0000-0000-000000000002')$q$);

insert into _results (result) select expect_allowed('author adds an activity to own draft',
  $q$insert into activities (id, daily_report_id, title)
     values ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','Rebar fixing')$q$);

insert into _results (result) select expect_denied('field_user CANNOT file a report as someone else',
  $q$insert into daily_reports (project_id, report_date, author_id)
     values ('aaaaaaaa-0000-4000-8000-000000000001','2026-03-02','00000000-0000-0000-0000-000000000004')$q$);

-- ---------------------------------------------------------------------------
-- A different field user must not be able to touch it
-- ---------------------------------------------------------------------------
do $$ begin perform as_user('00000000-0000-0000-0000-000000000004'); end $$;

insert into _results (result) select expect_denied('other field_user CANNOT edit another author''s draft',
  $q$update daily_reports set summary='tampered' where id='bbbbbbbb-0000-4000-8000-000000000001'$q$);
insert into _results (result) select expect_denied('other field_user CANNOT delete it',
  $q$delete from daily_reports where id='bbbbbbbb-0000-4000-8000-000000000001'$q$);
insert into _results (result) select expect_denied('other field_user CANNOT edit its line items',
  $q$update activities set title='tampered' where id='cccccccc-0000-4000-8000-000000000001'$q$);

-- ---------------------------------------------------------------------------
-- Viewers are strictly read-only
-- ---------------------------------------------------------------------------
do $$ begin perform as_user('00000000-0000-0000-0000-000000000003'); end $$;

insert into _results (result) select expect_denied('viewer CANNOT create a daily report',
  $q$insert into daily_reports (project_id, report_date, author_id)
     values ('aaaaaaaa-0000-4000-8000-000000000001','2026-03-03','00000000-0000-0000-0000-000000000003')$q$);
insert into _results (result) select expect_denied('viewer CANNOT create a project',
  $q$insert into projects (name) values ('Sneaky project')$q$);
insert into _results (result) select case
  when (select count(*) from daily_reports) = 1 then 'PASS  viewer CAN read daily reports'
  else 'FAIL  viewer should be able to read daily reports'
end;

-- ---------------------------------------------------------------------------
-- Privilege escalation
-- ---------------------------------------------------------------------------
insert into _results (result) select expect_denied('viewer CANNOT promote themselves to admin',
  $q$update profiles set role='admin' where id='00000000-0000-0000-0000-000000000003'$q$);
insert into _results (result) select expect_denied('viewer CANNOT change company settings',
  $q$update app_settings set company_name='Pwned' where id=true$q$);

-- ---------------------------------------------------------------------------
-- Submitting locks the report for its author
-- ---------------------------------------------------------------------------
reset role;
update daily_reports set status = 'submitted' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
set role authenticated;
do $$ begin perform as_user('00000000-0000-0000-0000-000000000002'); end $$;

insert into _results (result) select expect_denied('author CANNOT edit their report once submitted',
  $q$update daily_reports set summary='late edit' where id='bbbbbbbb-0000-4000-8000-000000000001'$q$);

-- ---------------------------------------------------------------------------
-- Managers review; nobody hand-edits job state
-- ---------------------------------------------------------------------------
do $$ begin perform as_user('00000000-0000-0000-0000-000000000001'); end $$;

insert into _results (result) select expect_allowed('admin CAN approve a submitted report',
  $q$update daily_reports set status='approved' where id='bbbbbbbb-0000-4000-8000-000000000001'$q$);
insert into _results (result) select expect_denied('admin CANNOT hand-edit job state (worker only)',
  $q$update report_jobs set status='completed'$q$);

reset role;

-- ---------------------------------------------------------------------------
-- Report and fail the build if anything regressed
-- ---------------------------------------------------------------------------
\echo ''
\echo '================ RLS TEST RESULTS ================'
select result from _results order by seq;

do $$
declare failures int;
begin
  select count(*) into failures from _results where result like 'FAIL%';
  if failures > 0 then
    raise exception '% RLS assertion(s) failed', failures;
  end if;
  raise notice 'All % RLS assertions passed', (select count(*) from _results);
end $$;
