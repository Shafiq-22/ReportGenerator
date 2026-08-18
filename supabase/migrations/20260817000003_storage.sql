-- =============================================================================
-- Storage buckets & policies
--
-- All buckets are private. Reads happen through short-lived signed URLs minted
-- server-side after an authorization check; writes are role-gated.
-- Paths are ID-based and prefixed by project:
--   photos/{project_id}/{daily_report_id}/{attachment_id}.{ext}
--   documents/{project_id}/{daily_report_id}/{attachment_id}.{ext}
--   report-exports/{project_id}/{generated_report_id}/v{n}.pdf
--   branding/logo.{ext}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'photos', 'photos', false, 26214400,  -- 25 MB
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'documents', 'documents', false, 104857600,  -- 100 MB
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'application/zip'
    ]
  ),
  ('report-exports', 'report-exports', false, 524288000, null),  -- 500 MB
  ('branding', 'branding', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- photos
-- -----------------------------------------------------------------------------
create policy "staff read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and is_staff());

create policy "writers upload photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and can_write());

create policy "writers update photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and can_write())
  with check (bucket_id = 'photos' and can_write());

create policy "owners and managers delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (owner = auth.uid() or is_manager()));

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
create policy "staff read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and is_staff());

create policy "writers upload documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and can_write());

create policy "writers update documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and can_write())
  with check (bucket_id = 'documents' and can_write());

create policy "owners and managers delete documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (owner = auth.uid() or is_manager()));

-- -----------------------------------------------------------------------------
-- report-exports — written ONLY by the worker (service role, bypasses RLS).
-- Staff may read; downloads are still handed out as signed URLs.
-- -----------------------------------------------------------------------------
create policy "staff read report exports" on storage.objects
  for select to authenticated
  using (bucket_id = 'report-exports' and is_staff());

create policy "managers delete report exports" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-exports' and is_manager());

-- -----------------------------------------------------------------------------
-- branding — company logo, admin-managed
-- -----------------------------------------------------------------------------
create policy "staff read branding" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and is_staff());

create policy "admins manage branding" on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and is_admin())
  with check (bucket_id = 'branding' and is_admin());
