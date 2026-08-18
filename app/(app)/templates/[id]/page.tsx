import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TemplateEditor } from '@/features/templates/template-editor'
import { defaultSectionTitle } from '@/lib/reports/section-model'
import type { ReportTemplateSection } from '@/lib/supabase/database.types'

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const { data: template } = await supabase
    .from('report_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!template) notFound()

  const { data: sections } = await supabase
    .from('report_template_sections')
    .select('*')
    .eq('template_id', id)
    .order('sort_order')

  return (
    <div className="space-y-6">
      <div>
        <Link href="/templates" className="text-sm text-brand-600 hover:underline">
          ← Templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{template.name}</h1>
      </div>

      <TemplateEditor
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          is_default: template.is_default,
          sections: ((sections ?? []) as ReportTemplateSection[]).map((section, index) => ({
            section_type: section.section_type,
            title: section.title || defaultSectionTitle(section.section_type),
            sort_order: index,
            enabled: section.enabled,
            config: (section.config ?? {}) as Record<string, unknown>,
          })),
        }}
      />
    </div>
  )
}
