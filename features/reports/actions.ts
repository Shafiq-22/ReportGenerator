'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl, workerSecret } from '@/lib/env'
import { generateReportSchema, type GenerateReportInput } from '@/lib/validation/schemas'
import type { Json } from '@/lib/supabase/database.types'

export interface GenerateResult {
  ok: boolean
  error?: string
  generatedReportId?: string
  jobId?: string
}

/**
 * Kicks the background worker without blocking the response.
 *
 * `after()` lets the Server Action return immediately while the request keeps
 * the function alive long enough to hand the job over. If this call is lost
 * (cold start, network blip), the cron sweeper picks the job up instead — the
 * queue row is the source of truth, not this fetch.
 */
function triggerWorker(jobId: string): void {
  after(async () => {
    try {
      await fetch(`${siteUrl()}/api/worker/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-worker-secret': workerSecret() },
        body: JSON.stringify({ jobId }),
      })
    } catch (error) {
      console.error('[reports] worker trigger failed; cron will retry', error)
    }
  })
}

export async function generateReportAction(input: GenerateReportInput): Promise<GenerateResult> {
  const current = await requireRole(MANAGER_ROLES)

  const parsed = generateReportSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid report settings' }
  }

  const supabase = await createClient()
  const { sections, only_approved, format, ...rest } = parsed.data

  const { data: report, error: reportError } = await supabase
    .from('generated_reports')
    .insert({
      project_id: rest.project_id,
      template_id: rest.template_id ?? null,
      title: rest.title,
      date_from: rest.date_from,
      date_to: rest.date_to,
      filters: { only_approved, sections } as unknown as Json,
      created_by: current.id,
    })
    .select('id')
    .single()

  if (reportError || !report) {
    return { ok: false, error: reportError?.message ?? 'Could not create the report' }
  }

  const queued = await queueVersion(report.id, format, current.id)
  if (!queued.ok) return queued

  await recordAudit({
    actorId: current.id,
    action: 'report.generate',
    entityType: 'generated_report',
    entityId: report.id,
    metadata: { title: rest.title, format },
  })

  revalidatePath('/reports')
  return { ok: true, generatedReportId: report.id, jobId: queued.jobId }
}

/** Builds the next version of an existing report definition. */
export async function regenerateReportAction(
  generatedReportId: string,
  format: 'pdf' | 'docx' = 'pdf',
): Promise<GenerateResult> {
  const current = await requireRole(MANAGER_ROLES)

  const queued = await queueVersion(generatedReportId, format, current.id)
  if (!queued.ok) return queued

  await recordAudit({
    actorId: current.id,
    action: 'report.regenerate',
    entityType: 'generated_report',
    entityId: generatedReportId,
  })

  revalidatePath(`/reports/${generatedReportId}`)
  return { ok: true, generatedReportId, jobId: queued.jobId }
}

/**
 * Creates the next `report_versions` row plus its job.
 *
 * Uses the service role for the version/job rows: users may create reports but
 * must not be able to write job state, so those tables have no client update
 * policy.
 */
async function queueVersion(
  generatedReportId: string,
  format: 'pdf' | 'docx',
  userId: string,
): Promise<GenerateResult> {
  const admin = createAdminClient()

  const { data: latest } = await admin
    .from('report_versions')
    .select('version_no')
    .eq('generated_report_id', generatedReportId)
    .eq('format', format)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const versionNo = (latest?.version_no ?? 0) + 1

  const { data: version, error: versionError } = await admin
    .from('report_versions')
    .insert({
      generated_report_id: generatedReportId,
      version_no: versionNo,
      format,
      created_by: userId,
    })
    .select('id')
    .single()

  if (versionError || !version) {
    return { ok: false, error: versionError?.message ?? 'Could not create the report version' }
  }

  const { data: job, error: jobError } = await admin
    .from('report_jobs')
    .insert({
      generated_report_id: generatedReportId,
      report_version_id: version.id,
      format,
      status: 'queued',
      step: 'Queued',
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return { ok: false, error: jobError?.message ?? 'Could not queue the report' }
  }

  triggerWorker(job.id)
  return { ok: true, jobId: job.id, generatedReportId }
}

export async function deleteGeneratedReportAction(
  generatedReportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const current = await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const { error } = await supabase.from('generated_reports').delete().eq('id', generatedReportId)
  if (error) return { ok: false, error: error.message }

  await recordAudit({
    actorId: current.id,
    action: 'report.delete',
    entityType: 'generated_report',
    entityId: generatedReportId,
  })

  revalidatePath('/reports')
  return { ok: true }
}
