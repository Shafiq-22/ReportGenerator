import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Activity,
  Attachment,
  Database,
  Equipment,
  Issue,
  Manpower,
  Material,
  SectionType,
} from '@/lib/supabase/database.types'
import { sectionConfigSchema, type SectionConfig } from '@/lib/validation/schemas'
import {
  attachPhotosToDays,
  computeTotals,
  defaultSectionTitle,
  type DayEntry,
  type ReportModel,
  type ResolvedSection,
} from './section-model'

type Client = SupabaseClient<Database>

interface StoredFilters {
  only_approved?: boolean
  sections?: Array<{
    section_type: SectionType
    title?: string | null
    sort_order: number
    enabled?: boolean
    config?: unknown
  }>
}

/**
 * Assembles the full report model for a `generated_reports` row.
 *
 * Runs with the service role inside the worker, so it deliberately re-reads
 * everything in scope rather than trusting anything the client sent beyond the
 * stored filters.
 */
export async function buildReportModel(
  supabase: Client,
  generatedReportId: string,
): Promise<ReportModel> {
  const { data: report, error } = await supabase
    .from('generated_reports')
    .select('*')
    .eq('id', generatedReportId)
    .single()

  if (error || !report) throw new Error('Generated report not found')

  const filters = (report.filters ?? {}) as StoredFilters

  const [projectRes, settingsRes, authorRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, client_name, location')
      .eq('id', report.project_id)
      .single(),
    supabase.from('app_settings').select('company_name').eq('id', true).maybeSingle(),
    report.created_by
      ? supabase.from('profiles').select('full_name').eq('id', report.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (projectRes.error || !projectRes.data) throw new Error('Project not found')

  // --- daily reports in range -------------------------------------------------
  let dailyQuery = supabase
    .from('daily_reports')
    .select('*')
    .eq('project_id', report.project_id)
    .gte('report_date', report.date_from)
    .lte('report_date', report.date_to)
    .order('report_date')

  if (filters.only_approved) {
    dailyQuery = dailyQuery.eq('status', 'approved')
  }

  const { data: dailyRows, error: dailyError } = await dailyQuery
  if (dailyError) throw new Error(dailyError.message)

  const reports = dailyRows ?? []
  const reportIds = reports.map((r) => r.id)

  // --- line items & attachments in bulk --------------------------------------
  const empty = { data: [] as never[] }
  const [activities, issues, manpower, equipment, materials, attachments, authors] =
    reportIds.length === 0
      ? [empty, empty, empty, empty, empty, empty, empty]
      : await Promise.all([
          supabase.from('activities').select('*').in('daily_report_id', reportIds).order('sort_order'),
          supabase.from('issues').select('*').in('daily_report_id', reportIds).order('sort_order'),
          supabase.from('manpower').select('*').in('daily_report_id', reportIds).order('sort_order'),
          supabase.from('equipment').select('*').in('daily_report_id', reportIds).order('sort_order'),
          supabase.from('materials').select('*').in('daily_report_id', reportIds).order('sort_order'),
          supabase
            .from('attachments')
            .select('*')
            .in('daily_report_id', reportIds)
            .order('sort_order')
            .order('created_at'),
          supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', [...new Set(reports.map((r) => r.author_id))]),
        ])

  const authorNames = new Map(
    ((authors.data ?? []) as Array<{ id: string; full_name: string | null }>).map((a) => [
      a.id,
      a.full_name,
    ]),
  )

  const byReport = <T extends { daily_report_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const list = map.get(row.daily_report_id) ?? []
      list.push(row)
      map.set(row.daily_report_id, list)
    }
    return map
  }

  const activityMap = byReport((activities.data ?? []) as Activity[])
  const issueMap = byReport((issues.data ?? []) as Issue[])
  const manpowerMap = byReport((manpower.data ?? []) as Manpower[])
  const equipmentMap = byReport((equipment.data ?? []) as Equipment[])
  const materialMap = byReport((materials.data ?? []) as Material[])

  const days: DayEntry[] = reports.map((row) => ({
    id: row.id,
    report_date: row.report_date,
    status: row.status,
    summary: row.summary,
    weather: row.weather,
    temperature: row.temperature,
    location: row.location,
    author_name: authorNames.get(row.author_id) ?? null,
    activities: activityMap.get(row.id) ?? [],
    issues: issueMap.get(row.id) ?? [],
    manpower: manpowerMap.get(row.id) ?? [],
    equipment: equipmentMap.get(row.id) ?? [],
    materials: materialMap.get(row.id) ?? [],
    photos: [],
    documents: [],
  }))

  const { photos, documents } = attachPhotosToDays(days, (attachments.data ?? []) as Attachment[])

  // --- sections ---------------------------------------------------------------
  const sections = await resolveSections(supabase, report.template_id, filters)

  return {
    title: report.title,
    companyName: settingsRes.data?.company_name ?? 'Company',
    project: projectRes.data,
    dateFrom: report.date_from,
    dateTo: report.date_to,
    generatedAt: new Date().toISOString(),
    generatedBy:
      (authorRes as { data: { full_name: string | null } | null }).data?.full_name ?? null,
    sections,
    days,
    photos,
    documents,
    totals: computeTotals(days),
  }
}

/**
 * Per-report section overrides win over the template, so a user can tweak one
 * report without editing the shared template.
 */
async function resolveSections(
  supabase: Client,
  templateId: string | null,
  filters: StoredFilters,
): Promise<ResolvedSection[]> {
  const parseConfig = (value: unknown): SectionConfig => {
    const result = sectionConfigSchema.safeParse(value ?? {})
    return result.success ? result.data : {}
  }

  if (filters.sections && filters.sections.length > 0) {
    return filters.sections
      .filter((section) => section.enabled !== false)
      .map((section) => ({
        section_type: section.section_type,
        title: section.title || defaultSectionTitle(section.section_type),
        sort_order: section.sort_order,
        config: parseConfig(section.config),
      }))
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  if (templateId) {
    const { data } = await supabase
      .from('report_template_sections')
      .select('*')
      .eq('template_id', templateId)
      .eq('enabled', true)
      .order('sort_order')

    if (data && data.length > 0) {
      return data.map((section) => ({
        section_type: section.section_type,
        title: section.title || defaultSectionTitle(section.section_type),
        sort_order: section.sort_order,
        config: parseConfig(section.config),
      }))
    }
  }

  // Sensible fallback so a report can always be produced.
  const fallback: SectionType[] = [
    'cover',
    'summary',
    'activities',
    'issues',
    'manpower',
    'equipment',
    'materials',
    'photos',
    'documents',
  ]
  return fallback.map((type, index) => ({
    section_type: type,
    title: defaultSectionTitle(type),
    sort_order: index,
    config: {},
  }))
}
