import { z } from 'zod'

/**
 * Shared validation. Imported by both client forms and Server Actions so the
 * rules cannot drift between what the UI accepts and what the server stores.
 */

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
const trimmed = (max: number) => z.string().trim().max(max)

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projectSchema = z
  .object({
    name: trimmed(200).min(1, 'Name is required'),
    code: trimmed(50).optional().or(z.literal('')),
    description: trimmed(4000).optional().or(z.literal('')),
    client_name: trimmed(200).optional().or(z.literal('')),
    location: trimmed(300).optional().or(z.literal('')),
    status: z.enum(['active', 'on_hold', 'completed', 'archived']).default('active'),
    start_date: isoDate.optional().or(z.literal('')),
    end_date: isoDate.optional().or(z.literal('')),
  })
  .refine(
    (v) => !v.start_date || !v.end_date || v.end_date >= v.start_date,
    { message: 'End date must be on or after the start date', path: ['end_date'] },
  )

export type ProjectInput = z.infer<typeof projectSchema>

// ---------------------------------------------------------------------------
// Daily reports
// ---------------------------------------------------------------------------
export const dailyReportSchema = z.object({
  project_id: uuid,
  report_date: isoDate,
  weather: trimmed(100).optional().or(z.literal('')),
  temperature: z.coerce.number().min(-90).max(70).optional().nullable(),
  summary: trimmed(20000).optional().or(z.literal('')),
  location: trimmed(300).optional().or(z.literal('')),
})

export type DailyReportInput = z.infer<typeof dailyReportSchema>

export const activitySchema = z.object({
  id: uuid.optional(),
  title: trimmed(300).min(1, 'Title is required'),
  description: trimmed(4000).optional().or(z.literal('')),
  category: trimmed(100).optional().or(z.literal('')),
  percent_complete: z.coerce.number().int().min(0).max(100).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).default(0),
})

export const issueSchema = z.object({
  id: uuid.optional(),
  title: trimmed(300).min(1, 'Title is required'),
  description: trimmed(4000).optional().or(z.literal('')),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['open', 'monitoring', 'resolved']).default('open'),
  delay_days: z.coerce.number().min(0).max(3650).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).default(0),
})

export const manpowerSchema = z.object({
  id: uuid.optional(),
  trade: trimmed(150).min(1, 'Trade is required'),
  contractor: trimmed(200).optional().or(z.literal('')),
  headcount: z.coerce.number().int().min(0).max(10000).default(0),
  hours: z.coerce.number().min(0).max(24).optional().nullable(),
  notes: trimmed(2000).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).default(0),
})

export const equipmentSchema = z.object({
  id: uuid.optional(),
  name: trimmed(200).min(1, 'Name is required'),
  quantity: z.coerce.number().int().min(0).max(10000).default(1),
  hours_used: z.coerce.number().min(0).max(24).optional().nullable(),
  status: trimmed(50).optional().or(z.literal('')),
  notes: trimmed(2000).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).default(0),
})

export const materialSchema = z.object({
  id: uuid.optional(),
  name: trimmed(200).min(1, 'Name is required'),
  quantity: z.coerce.number().min(0).optional().nullable(),
  unit: trimmed(50).optional().or(z.literal('')),
  supplier: trimmed(200).optional().or(z.literal('')),
  notes: trimmed(2000).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).default(0),
})

/** Full autosave payload for the daily entry screen. */
export const dailyReportSavePayload = z.object({
  report: dailyReportSchema.partial().extend({ id: uuid }),
  activities: z.array(activitySchema).max(200).optional(),
  issues: z.array(issueSchema).max(200).optional(),
  manpower: z.array(manpowerSchema).max(200).optional(),
  equipment: z.array(equipmentSchema).max(200).optional(),
  materials: z.array(materialSchema).max(200).optional(),
})

export type DailyReportSavePayload = z.infer<typeof dailyReportSavePayload>

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024

export const PHOTO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
] as const

export const uploadRequestSchema = z
  .object({
    project_id: uuid,
    daily_report_id: uuid.optional().nullable(),
    file_name: trimmed(300).min(1),
    mime_type: trimmed(200).min(1),
    size_bytes: z.coerce.number().int().min(1),
  })
  .refine(
    (v) =>
      ([...PHOTO_MIME_TYPES] as string[]).includes(v.mime_type) ||
      ([...DOCUMENT_MIME_TYPES] as string[]).includes(v.mime_type),
    { message: 'Unsupported file type', path: ['mime_type'] },
  )
  .refine(
    (v) =>
      ([...PHOTO_MIME_TYPES] as string[]).includes(v.mime_type)
        ? v.size_bytes <= MAX_PHOTO_BYTES
        : v.size_bytes <= MAX_DOCUMENT_BYTES,
    { message: 'File is too large', path: ['size_bytes'] },
  )

export type UploadRequest = z.infer<typeof uploadRequestSchema>

export function kindForMime(mime: string): 'photo' | 'document' | 'other' {
  if (([...PHOTO_MIME_TYPES] as string[]).includes(mime)) return 'photo'
  if (([...DOCUMENT_MIME_TYPES] as string[]).includes(mime)) return 'document'
  return 'other'
}

export function bucketForKind(kind: 'photo' | 'document' | 'other'): string {
  return kind === 'photo' ? 'photos' : 'documents'
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------
export const sectionTypeEnum = z.enum([
  'cover',
  'summary',
  'activities',
  'issues',
  'manpower',
  'equipment',
  'materials',
  'photos',
  'documents',
  'custom',
])

export const sectionConfigSchema = z.object({
  columns: z.coerce.number().int().min(1).max(4).optional(),
  showCaptions: z.boolean().optional(),
  placement: z.enum(['inline', 'appendix']).optional(),
  groupBy: z.enum(['day', 'category']).optional(),
  mode: z.enum(['summary', 'detail', 'index']).optional(),
  includeResolved: z.boolean().optional(),
  maxPerDay: z.coerce.number().int().min(1).max(200).optional(),
  body: trimmed(20000).optional(),
})

export type SectionConfig = z.infer<typeof sectionConfigSchema>

export const reportSectionSchema = z.object({
  section_type: sectionTypeEnum,
  title: trimmed(200).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0),
  enabled: z.boolean().default(true),
  config: sectionConfigSchema.default({}),
})

export const generateReportSchema = z
  .object({
    project_id: uuid,
    template_id: uuid.optional().nullable(),
    title: trimmed(300).min(1, 'Title is required'),
    date_from: isoDate,
    date_to: isoDate,
    format: z.enum(['pdf', 'docx']).default('pdf'),
    only_approved: z.boolean().default(false),
    sections: z.array(reportSectionSchema).min(1, 'At least one section is required'),
  })
  .refine((v) => v.date_to >= v.date_from, {
    message: 'End date must be on or after the start date',
    path: ['date_to'],
  })

export type GenerateReportInput = z.infer<typeof generateReportSchema>

// ---------------------------------------------------------------------------
// Templates & settings
// ---------------------------------------------------------------------------
export const templateSchema = z.object({
  name: trimmed(200).min(1, 'Name is required'),
  description: trimmed(2000).optional().or(z.literal('')),
  is_default: z.boolean().default(false),
  sections: z.array(reportSectionSchema).min(1),
})

export const settingsSchema = z.object({
  company_name: trimmed(200).min(1, 'Company name is required'),
})

export const roleSchema = z.object({
  user_id: uuid,
  role: z.enum(['admin', 'project_manager', 'field_user', 'viewer']),
})
