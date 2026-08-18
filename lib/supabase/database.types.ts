/**
 * Database types.
 *
 * These are hand-maintained to mirror `supabase/migrations`. Once a local or
 * remote database is available, regenerate the authoritative version with:
 *
 *   pnpm db:types      # supabase gen types typescript --local
 *
 * Insert/Update shapes are derived from Row rather than spelled out per table;
 * that keeps this file readable while still typing every query.
 */

export type AppRole = 'admin' | 'project_manager' | 'field_user' | 'viewer'
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'
export type IssueStatus = 'open' | 'monitoring' | 'resolved'
export type AttachmentKind = 'photo' | 'document' | 'other'
export type SectionType =
  | 'cover'
  | 'summary'
  | 'activities'
  | 'issues'
  | 'manpower'
  | 'equipment'
  | 'materials'
  | 'photos'
  | 'documents'
  | 'custom'
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type ReportFormat = 'pdf' | 'docx'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Profile = {
  id: string
  full_name: string | null
  email: string | null
  avatar_path: string | null
  role: AppRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AppSettings = {
  id: boolean
  company_name: string
  logo_path: string | null
  settings: Json
  updated_at: string
}

export type Project = {
  id: string
  name: string
  code: string | null
  description: string | null
  client_name: string | null
  location: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ProjectMember = {
  project_id: string
  user_id: string
  created_at: string
}

export type DailyReport = {
  id: string
  project_id: string
  report_date: string
  author_id: string
  status: ReportStatus
  weather: string | null
  temperature: number | null
  summary: string | null
  location: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  autosaved_at: string | null
  created_at: string
  updated_at: string
}

export type Activity = {
  id: string
  daily_report_id: string
  title: string
  description: string | null
  category: string | null
  percent_complete: number | null
  sort_order: number
}

export type Issue = {
  id: string
  daily_report_id: string
  title: string
  description: string | null
  severity: IssueSeverity
  status: IssueStatus
  delay_days: number | null
  resolved_at: string | null
  sort_order: number
}

export type Manpower = {
  id: string
  daily_report_id: string
  trade: string
  contractor: string | null
  headcount: number
  hours: number | null
  notes: string | null
  sort_order: number
}

export type Equipment = {
  id: string
  daily_report_id: string
  name: string
  quantity: number
  hours_used: number | null
  status: string | null
  notes: string | null
  sort_order: number
}

export type Material = {
  id: string
  daily_report_id: string
  name: string
  quantity: number | null
  unit: string | null
  supplier: string | null
  notes: string | null
  sort_order: number
}

export type Attachment = {
  id: string
  project_id: string
  daily_report_id: string | null
  kind: AttachmentKind
  bucket: string
  storage_path: string
  thumbnail_path: string | null
  file_name: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  taken_at: string | null
  caption: string | null
  sort_order: number
  uploaded_by: string | null
  created_at: string
}

export type Tag = {
  id: string
  name: string
  color: string | null
}

export type EntityTag = {
  tag_id: string
  entity_type: string
  entity_id: string
}

export type Comment = {
  id: string
  entity_type: string
  entity_id: string
  author_id: string
  body: string
  created_at: string
}

export type ReportTemplate = {
  id: string
  name: string
  description: string | null
  is_default: boolean
  config: Json
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ReportTemplateSection = {
  id: string
  template_id: string
  section_type: SectionType
  title: string | null
  sort_order: number
  config: Json
  enabled: boolean
}

export type GeneratedReport = {
  id: string
  project_id: string
  template_id: string | null
  title: string
  date_from: string
  date_to: string
  filters: Json
  created_by: string | null
  created_at: string
}

export type ReportVersion = {
  id: string
  generated_report_id: string
  version_no: number
  format: ReportFormat
  storage_path: string | null
  size_bytes: number | null
  page_count: number | null
  created_by: string | null
  created_at: string
}

export type ReportJob = {
  id: string
  generated_report_id: string
  report_version_id: string | null
  format: ReportFormat
  status: JobStatus
  progress: number
  step: string | null
  error: string | null
  attempts: number
  locked_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type AuditLog = {
  id: string
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Json
  created_at: string
}

/** Generic table shape accepted by supabase-js. */
type TableDef<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile>
      app_settings: TableDef<AppSettings>
      projects: TableDef<Project>
      project_members: TableDef<ProjectMember>
      daily_reports: TableDef<DailyReport>
      activities: TableDef<Activity>
      issues: TableDef<Issue>
      manpower: TableDef<Manpower>
      equipment: TableDef<Equipment>
      materials: TableDef<Material>
      attachments: TableDef<Attachment>
      tags: TableDef<Tag>
      entity_tags: TableDef<EntityTag>
      comments: TableDef<Comment>
      report_templates: TableDef<ReportTemplate>
      report_template_sections: TableDef<ReportTemplateSection>
      generated_reports: TableDef<GeneratedReport>
      report_versions: TableDef<ReportVersion>
      report_jobs: TableDef<ReportJob>
      audit_logs: TableDef<AuditLog>
    }
    Views: {
      photos: TableDef<Attachment>
    }
    Functions: Record<string, never>
    Enums: {
      app_role: AppRole
      project_status: ProjectStatus
      report_status: ReportStatus
      issue_severity: IssueSeverity
      issue_status: IssueStatus
      attachment_kind: AttachmentKind
      section_type: SectionType
      job_status: JobStatus
      report_format: ReportFormat
    }
    CompositeTypes: Record<string, never>
  }
}
