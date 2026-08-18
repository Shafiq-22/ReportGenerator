'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { attachmentPath } from '@/lib/storage'
import { bucketForKind, kindForMime, uploadRequestSchema } from '@/lib/validation/schemas'
import { fileExtension } from '@/lib/utils'

export interface SignedUploadTarget {
  attachmentId: string
  bucket: string
  path: string
  token: string
  kind: 'photo' | 'document' | 'other'
}

export interface UploadPrepareResult {
  ok: boolean
  target?: SignedUploadTarget
  error?: string
}

/**
 * Validates an intended upload and hands back a signed upload target.
 *
 * The bytes go straight from the browser to Supabase Storage — they never pass
 * through a serverless function, which is what keeps large files viable.
 * The `attachments` row is only written once the upload succeeds
 * (`registerAttachmentAction`), so a failed upload leaves no dangling row.
 */
export async function prepareUploadAction(input: {
  project_id: string
  daily_report_id?: string | null
  file_name: string
  mime_type: string
  size_bytes: number
}): Promise<UploadPrepareResult> {
  await requireUser()

  const parsed = uploadRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid file' }
  }

  const kind = kindForMime(parsed.data.mime_type)
  const bucket = bucketForKind(kind)
  const attachmentId = crypto.randomUUID()
  const path = attachmentPath({
    projectId: parsed.data.project_id,
    dailyReportId: parsed.data.daily_report_id ?? null,
    attachmentId,
    extension: fileExtension(parsed.data.file_name),
  })

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path)

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not prepare the upload' }
  }

  return { ok: true, target: { attachmentId, bucket, path, token: data.token, kind } }
}

export async function registerAttachmentAction(input: {
  id: string
  project_id: string
  daily_report_id?: string | null
  bucket: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  width?: number | null
  height?: number | null
}): Promise<{ ok: boolean; error?: string }> {
  const current = await requireUser()
  const supabase = await createClient()

  const kind = kindForMime(input.mime_type)

  const { error } = await supabase.from('attachments').insert({
    id: input.id,
    project_id: input.project_id,
    daily_report_id: input.daily_report_id ?? null,
    kind,
    bucket: input.bucket,
    storage_path: input.storage_path,
    file_name: input.file_name,
    mime_type: input.mime_type,
    size_bytes: input.size_bytes,
    width: input.width ?? null,
    height: input.height ?? null,
    uploaded_by: current.id,
  })

  if (error) return { ok: false, error: error.message }

  if (input.daily_report_id) revalidatePath(`/reports/daily/${input.daily_report_id}`)
  revalidatePath(`/projects/${input.project_id}/files`)
  return { ok: true }
}

export async function updateAttachmentAction(
  id: string,
  values: { caption?: string; sort_order?: number },
): Promise<{ ok: boolean; error?: string }> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('attachments')
    .update({
      ...(values.caption !== undefined ? { caption: values.caption || null } : {}),
      ...(values.sort_order !== undefined ? { sort_order: values.sort_order } : {}),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteAttachmentAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const current = await requireUser()
  const supabase = await createClient()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('id, bucket, storage_path, thumbnail_path, project_id, daily_report_id')
    .eq('id', id)
    .maybeSingle()

  if (!attachment) return { ok: false, error: 'File not found' }

  // Remove the row first: RLS decides whether this user may delete it at all.
  const { error } = await supabase.from('attachments').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  const paths = [attachment.storage_path, attachment.thumbnail_path].filter(
    (p): p is string => Boolean(p),
  )
  await supabase.storage.from(attachment.bucket).remove(paths)

  await recordAudit({
    actorId: current.id,
    action: 'attachment.delete',
    entityType: 'attachment',
    entityId: id,
  })

  if (attachment.daily_report_id) revalidatePath(`/reports/daily/${attachment.daily_report_id}`)
  revalidatePath(`/projects/${attachment.project_id}/files`)
  return { ok: true }
}
