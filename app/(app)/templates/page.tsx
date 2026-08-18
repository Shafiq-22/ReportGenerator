import Link from 'next/link'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/card'
import type { ReportTemplateSection } from '@/lib/supabase/database.types'

export const metadata = { title: 'Templates · Report Generator' }

export default async function TemplatesPage() {
  await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const [templatesRes, sectionsRes] = await Promise.all([
    supabase
      .from('report_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name'),
    supabase.from('report_template_sections').select('*').order('sort_order'),
  ])

  const templates = templatesRes.data ?? []
  const sections = (sectionsRes.data ?? []) as ReportTemplateSection[]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Report templates</h1>
          <p className="text-sm text-slate-500">
            Reusable section layouts. The default is preselected in the report builder.
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/new">New template</Link>
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="No templates"
          description="Create a template to control what goes into your reports."
          action={
            <Button asChild>
              <Link href="/templates/new">Create template</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => {
            const own = sections.filter((s) => s.template_id === template.id)
            return (
              <li key={template.id}>
                <Link href={`/templates/${template.id}`}>
                  <Card className="transition-colors hover:border-brand-300">
                    <CardBody className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{template.name}</p>
                        {template.is_default ? <Badge tone="blue">Default</Badge> : null}
                      </div>
                      {template.description ? (
                        <p className="text-sm text-slate-500">{template.description}</p>
                      ) : null}
                      <p className="text-xs text-slate-400">
                        {own
                          .filter((s) => s.enabled)
                          .map((s) => s.title || s.section_type)
                          .join(' · ') || 'No sections'}
                      </p>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
