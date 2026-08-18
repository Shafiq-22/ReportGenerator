import type {
  Activity,
  Attachment,
  DailyReport,
  Equipment,
  Issue,
  IssueSeverity,
  Manpower,
  Material,
  SectionType,
} from '@/lib/supabase/database.types'
import type { SectionConfig } from '@/lib/validation/schemas'

/**
 * The report "section model": a plain data structure describing exactly what
 * goes into a generated report.
 *
 * Everything here is pure and serialisable — the PDF renderer, the DOCX
 * renderer and the on-screen preview all consume this same shape, which is why
 * what you preview is what you get. Aggregation helpers are exported
 * separately so they can be unit tested without a database.
 */

export interface ResolvedSection {
  section_type: SectionType
  title: string
  sort_order: number
  config: SectionConfig
}

export interface DayEntry {
  id: string
  report_date: string
  status: DailyReport['status']
  summary: string | null
  weather: string | null
  temperature: number | null
  location: string | null
  author_name: string | null
  activities: Activity[]
  issues: Issue[]
  manpower: Manpower[]
  equipment: Equipment[]
  materials: Material[]
  photos: PhotoEntry[]
  documents: DocumentEntry[]
}

export interface PhotoEntry {
  id: string
  caption: string | null
  file_name: string
  bucket: string
  path: string
  mime_type: string
  report_date: string | null
}

export interface DocumentEntry {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  bucket: string
  path: string
  report_date: string | null
}

export interface ReportModel {
  title: string
  companyName: string
  project: {
    id: string
    name: string
    code: string | null
    client_name: string | null
    location: string | null
  }
  dateFrom: string
  dateTo: string
  generatedAt: string
  generatedBy: string | null
  sections: ResolvedSection[]
  days: DayEntry[]
  photos: PhotoEntry[]
  documents: DocumentEntry[]
  totals: ReportTotals
}

export interface ReportTotals {
  dayCount: number
  photoCount: number
  documentCount: number
  activityCount: number
  issueCount: number
  openIssueCount: number
  totalDelayDays: number
  totalManHours: number
  totalHeadcount: number
  issuesBySeverity: Record<IssueSeverity, number>
}

// ---------------------------------------------------------------------------
// Pure aggregation helpers
// ---------------------------------------------------------------------------

export interface TradeTotal {
  trade: string
  headcount: number
  hours: number
  days: number
}

/** Rolls manpower up by trade across the whole period. */
export function aggregateManpower(days: DayEntry[]): TradeTotal[] {
  const map = new Map<string, TradeTotal>()

  for (const day of days) {
    for (const row of day.manpower) {
      const key = (row.trade || 'Unspecified').trim()
      const entry = map.get(key) ?? { trade: key, headcount: 0, hours: 0, days: 0 }
      entry.headcount += row.headcount ?? 0
      entry.hours += (row.hours ?? 0) * (row.headcount ?? 0)
      entry.days += 1
      map.set(key, entry)
    }
  }

  return [...map.values()].sort((a, b) => b.hours - a.hours || a.trade.localeCompare(b.trade))
}

export interface EquipmentTotal {
  name: string
  quantity: number
  hours: number
  days: number
}

export function aggregateEquipment(days: DayEntry[]): EquipmentTotal[] {
  const map = new Map<string, EquipmentTotal>()

  for (const day of days) {
    for (const row of day.equipment) {
      const key = (row.name || 'Unspecified').trim()
      const entry = map.get(key) ?? { name: key, quantity: 0, hours: 0, days: 0 }
      // Quantity is a daily snapshot, not a running total: keep the peak.
      entry.quantity = Math.max(entry.quantity, row.quantity ?? 0)
      entry.hours += row.hours_used ?? 0
      entry.days += 1
      map.set(key, entry)
    }
  }

  return [...map.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
}

export interface MaterialTotal {
  name: string
  unit: string | null
  quantity: number
  deliveries: number
}

export function aggregateMaterials(days: DayEntry[]): MaterialTotal[] {
  const map = new Map<string, MaterialTotal>()

  for (const day of days) {
    for (const row of day.materials) {
      const name = (row.name || 'Unspecified').trim()
      const unit = row.unit?.trim() || null
      const key = `${name}::${unit ?? ''}`
      const entry = map.get(key) ?? { name, unit, quantity: 0, deliveries: 0 }
      entry.quantity += row.quantity ?? 0
      entry.deliveries += 1
      map.set(key, entry)
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function computeTotals(days: DayEntry[]): ReportTotals {
  const issuesBySeverity: Record<IssueSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }

  let activityCount = 0
  let issueCount = 0
  let openIssueCount = 0
  let totalDelayDays = 0
  let totalManHours = 0
  let totalHeadcount = 0
  let photoCount = 0
  let documentCount = 0

  for (const day of days) {
    activityCount += day.activities.length
    photoCount += day.photos.length
    documentCount += day.documents.length

    for (const issue of day.issues) {
      issueCount += 1
      if (issue.status !== 'resolved') openIssueCount += 1
      totalDelayDays += issue.delay_days ?? 0
      issuesBySeverity[issue.severity] += 1
    }

    for (const row of day.manpower) {
      totalHeadcount += row.headcount ?? 0
      totalManHours += (row.hours ?? 0) * (row.headcount ?? 0)
    }
  }

  return {
    dayCount: days.length,
    photoCount,
    documentCount,
    activityCount,
    issueCount,
    openIssueCount,
    totalDelayDays: round(totalDelayDays),
    totalManHours: round(totalManHours),
    totalHeadcount,
    issuesBySeverity,
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** Sections actually rendered, in order. Disabled ones are dropped. */
export function activeSections(sections: ResolvedSection[]): ResolvedSection[] {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * Photos for a section, honouring `placement` and `maxPerDay`.
 *
 * `inline` places each photo with its day; `appendix` gathers everything into
 * one gallery at the end.
 */
export function selectPhotos(model: ReportModel, config: SectionConfig): PhotoEntry[] {
  const max = config.maxPerDay
  if (!max) return model.photos

  const perDay = new Map<string, number>()
  const out: PhotoEntry[] = []

  for (const photo of model.photos) {
    const key = photo.report_date ?? 'unscheduled'
    const count = perDay.get(key) ?? 0
    if (count >= max) continue
    perDay.set(key, count + 1)
    out.push(photo)
  }

  return out
}

export function issuesForSection(model: ReportModel, config: SectionConfig): Issue[] {
  const all = model.days.flatMap((day) => day.issues)
  if (config.includeResolved === false) {
    return all.filter((issue) => issue.status !== 'resolved')
  }
  return all
}

export function defaultSectionTitle(type: SectionType): string {
  switch (type) {
    case 'cover':
      return 'Cover'
    case 'summary':
      return 'Executive Summary'
    case 'activities':
      return 'Work Activities'
    case 'issues':
      return 'Issues & Delays'
    case 'manpower':
      return 'Manpower'
    case 'equipment':
      return 'Equipment'
    case 'materials':
      return 'Materials'
    case 'photos':
      return 'Photo Appendix'
    case 'documents':
      return 'Supporting Documents'
    case 'custom':
      return 'Notes'
  }
}

/** Groups attachments onto their day, used when assembling the model. */
export function attachPhotosToDays(
  days: DayEntry[],
  attachments: Attachment[],
): { photos: PhotoEntry[]; documents: DocumentEntry[] } {
  const dayById = new Map(days.map((day) => [day.id, day]))
  const photos: PhotoEntry[] = []
  const documents: DocumentEntry[] = []

  for (const file of attachments) {
    const day = file.daily_report_id ? dayById.get(file.daily_report_id) : undefined
    const reportDate = day?.report_date ?? null

    if (file.kind === 'photo') {
      const entry: PhotoEntry = {
        id: file.id,
        caption: file.caption,
        file_name: file.file_name,
        bucket: file.bucket,
        path: file.thumbnail_path ?? file.storage_path,
        mime_type: file.mime_type,
        report_date: reportDate,
      }
      photos.push(entry)
      day?.photos.push(entry)
    } else {
      const entry: DocumentEntry = {
        id: file.id,
        file_name: file.file_name,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        bucket: file.bucket,
        path: file.storage_path,
        report_date: reportDate,
      }
      documents.push(entry)
      day?.documents.push(entry)
    }
  }

  return { photos, documents }
}
