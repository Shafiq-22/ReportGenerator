import Link from 'next/link'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { defaultSectionTitle } from '@/lib/reports/section-model'
import { sectionConfigSchema } from '@/lib/validation/schemas'
import {
  ReportBuilder,
  type BuilderSection,
  type BuilderTemplate,
} from '@/features/reports/report-builder'
import { toDateInput } from '@/lib/utils'
import type { ReportTemplateSection } from '@/lib/supabase/database.types'

export const metadata = { title: 'Build report · Report Generator' }

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  await requireRole(MANAGER_ROLES)
  const { project } = await searchParams
  const supabase = await createClient()

  const [projectsRes, templatesRes, sectionsRes] = await Promise.all([
    supabase.from('projects').select('id, name').order('name'),
    supabase.from('report_templates').select('id, name, is_default').order('is_default', {
      ascending: false,
    }),
    supabase.from('report_template_sections').select('*').order('sort_order'),
  ])

  const projects = projectsRes.data ?? []
  const allSections = (sectionsRes.data ?? []) as ReportTemplateSection[]

  const templates: BuilderTemplate[] = (templatesRes.data ?? []).map((template) => ({
    id: template.id,
    name: template.is_default ? `${template.name} (default)` : template.name,
    sections: allSections
      .filter((section) => section.template_id === template.id)
      .map<BuilderSection>((section, index) => {
        const parsed = sectionConfigSchema.safeParse(section.config ?? {})
        return {
          section_type: section.section_type,
          title: section.title || defaultSectionTitle(section.section_type),
          sort_order: index,
          enabled: section.enabled,
          config: parsed.success ? parsed.data : {},
        }
      }),
  }))

  if (projects.length === 0 || templates.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-slate-900">Build report</h1>
        <EmptyState
          title={projects.length === 0 ? 'No projects yet' : 'No report templates'}
          description={
            projects.length === 0
              ? 'Create a project and log some daily reports first.'
              : 'Create a template before generating a report.'
          }
          action={
            <Button asChild>
              <Link href={projects.length === 0 ? '/projects/new' : '/templates'}>
                {projects.length === 0 ? 'Create project' : 'Go to templates'}
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  // Default to the last 30 days — the common "monthly report" case.
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 30)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-brand-600 hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Build report</h1>
        <p className="text-sm text-slate-500">
          Choose the scope and sections, then generate. Large reports keep running in the
          background.
        </p>
      </div>

      <ReportBuilder
        projects={projects}
        templates={templates}
        initialProjectId={project}
        defaultRange={{ from: toDateInput(from), to: toDateInput(today) }}
      />
    </div>
  )
}
