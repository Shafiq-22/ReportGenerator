import { Badge } from '@/components/ui/card'
import type { IssueSeverity, ProjectStatus, ReportStatus } from '@/lib/supabase/database.types'

const REPORT_TONE: Record<ReportStatus, 'slate' | 'amber' | 'green' | 'red'> = {
  draft: 'slate',
  submitted: 'amber',
  approved: 'green',
  rejected: 'red',
}

const PROJECT_TONE: Record<ProjectStatus, 'green' | 'amber' | 'blue' | 'slate'> = {
  active: 'green',
  on_hold: 'amber',
  completed: 'blue',
  archived: 'slate',
}

const SEVERITY_TONE: Record<IssueSeverity, 'slate' | 'amber' | 'red'> = {
  low: 'slate',
  medium: 'amber',
  high: 'red',
  critical: 'red',
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={REPORT_TONE[status]}>{humanize(status)}</Badge>
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={PROJECT_TONE[status]}>{humanize(status)}</Badge>
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{humanize(severity)}</Badge>
}
