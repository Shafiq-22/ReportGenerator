'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MANAGER_ROLES, requireRole, requireUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { dailyReportSavePayload, type DailyReportSavePayload } from '@/lib/validation/schemas'

/** Line-item tables that hang off a daily report. */
const LINE_TABLES = ['activities', 'issues', 'manpower', 'equipment', 'materials'] as const
type LineTable = (typeof LINE_TABLES)[number]

/**
 * Opens today's report for a project, creating a draft if the user does not
 * have one for that date yet. Reports are unique per (project, date, author).
 */
export async function openDailyReportAction(formData: FormData): Promise<void> {
  const current = await requireUser()
  const projectId = String(formData.get('project_id') ?? '')
  const reportDate = String(formData.get('report_date') ?? '')

  if (!projectId || !reportDate) redirect('/projects')

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('project_id', projectId)
    .eq('report_date', reportDate)
    .eq('author_id', current.id)
    .maybeSingle()

  if (existing) redirect(`/reports/daily/${existing.id}`)

  const { data: created, error } = await supabase
    .from('daily_reports')
    .insert({
      project_id: projectId,
      report_date: reportDate,
      author_id: current.id,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !created) {
    redirect(`/projects/${projectId}?error=${encodeURIComponent(error?.message ?? 'Could not create report')}`)
  }

  await recordAudit({
    actorId: current.id,
    action: 'daily_report.create',
    entityType: 'daily_report',
    entityId: created.id,
    metadata: { project_id: projectId, report_date: reportDate },
  })

  redirect(`/reports/daily/${created.id}`)
}

export interface SaveResult {
  ok: boolean
  savedAt?: string
  error?: string
}

/**
 * Autosave for the daily entry screen.
 *
 * Line items are upserted by client-generated UUID and any row no longer in
 * the payload is deleted. That keeps ids stable across saves and avoids the
 * destructive "delete everything then re-insert" window.
 */
export async function saveDailyReportAction(
  payload: DailyReportSavePayload,
): Promise<SaveResult> {
  await requireUser()

  const parsed = dailyReportSavePayload.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const { report, ...lines } = parsed.data
  const supabase = await createClient()
  const savedAt = new Date().toISOString()

  const { error: reportError } = await supabase
    .from('daily_reports')
    .update({
      report_date: report.report_date,
      weather: report.weather || null,
      temperature: report.temperature ?? null,
      summary: report.summary || null,
      location: report.location || null,
      autosaved_at: savedAt,
    })
    .eq('id', report.id)

  // RLS rejects edits to someone else's report, or to a submitted one.
  if (reportError) return { ok: false, error: reportError.message }

  for (const table of LINE_TABLES) {
    const rows = lines[table as keyof typeof lines]
    if (!rows) continue

    const withParent = rows.map((row) => ({
      ...row,
      id: row.id,
      daily_report_id: report.id,
    }))

    if (withParent.length > 0) {
      const { error } = await supabase
        .from(table as LineTable)
        .upsert(withParent as never, { onConflict: 'id' })
      if (error) return { ok: false, error: error.message }
    }

    const keepIds = withParent.map((row) => row.id).filter(Boolean) as string[]
    let deleteQuery = supabase.from(table as LineTable).delete().eq('daily_report_id', report.id)
    if (keepIds.length > 0) {
      deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.join(',')})`)
    }
    const { error: deleteError } = await deleteQuery
    if (deleteError) return { ok: false, error: deleteError.message }
  }

  revalidatePath(`/reports/daily/${report.id}`)
  return { ok: true, savedAt }
}

export async function submitDailyReportAction(reportId: string): Promise<SaveResult> {
  const current = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('daily_reports')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', reportId)

  if (error) return { ok: false, error: error.message }

  await recordAudit({
    actorId: current.id,
    action: 'daily_report.submit',
    entityType: 'daily_report',
    entityId: reportId,
  })

  revalidatePath(`/reports/daily/${reportId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function reviewDailyReportAction(
  reportId: string,
  decision: 'approved' | 'rejected',
): Promise<SaveResult> {
  const current = await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const { error } = await supabase
    .from('daily_reports')
    .update({
      status: decision,
      approved_by: current.id,
      approved_at: decision === 'approved' ? new Date().toISOString() : null,
    })
    .eq('id', reportId)

  if (error) return { ok: false, error: error.message }

  await recordAudit({
    actorId: current.id,
    action: `daily_report.${decision}`,
    entityType: 'daily_report',
    entityId: reportId,
  })

  revalidatePath(`/reports/daily/${reportId}`)
  revalidatePath('/reports/approvals')
  return { ok: true }
}

/**
 * Copies manpower, equipment and materials (and optionally activities) from the
 * most recent earlier report on the same project into this draft.
 *
 * This is the single biggest time saver in daily entry: crews and kit rarely
 * change day to day.
 */
export async function copyPreviousDayAction(
  reportId: string,
  includeActivities = false,
): Promise<SaveResult & { copied?: number }> {
  await requireUser()
  const supabase = await createClient()

  const { data: report, error: reportError } = await supabase
    .from('daily_reports')
    .select('id, project_id, report_date')
    .eq('id', reportId)
    .single()

  if (reportError || !report) return { ok: false, error: 'Report not found' }

  const { data: previous } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('project_id', report.project_id)
    .lt('report_date', report.report_date)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!previous) return { ok: false, error: 'No earlier report on this project to copy from.' }

  const tables: LineTable[] = includeActivities
    ? ['manpower', 'equipment', 'materials', 'activities']
    : ['manpower', 'equipment', 'materials']

  let copied = 0

  for (const table of tables) {
    const { data: rows } = await supabase.from(table).select('*').eq('daily_report_id', previous.id)
    if (!rows || rows.length === 0) continue

    const clones = rows.map((row) => {
      const { id: _id, daily_report_id: _parent, ...rest } = row as Record<string, unknown>
      return { ...rest, daily_report_id: reportId }
    })

    const { error } = await supabase.from(table).insert(clones as never)
    if (error) return { ok: false, error: error.message }
    copied += clones.length
  }

  revalidatePath(`/reports/daily/${reportId}`)
  return { ok: true, copied }
}

export async function deleteDailyReportAction(reportId: string, projectId: string): Promise<void> {
  const current = await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  await supabase.from('daily_reports').delete().eq('id', reportId)

  await recordAudit({
    actorId: current.id,
    action: 'daily_report.delete',
    entityType: 'daily_report',
    entityId: reportId,
  })

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}
