'use server'

import { revalidatePath } from 'next/cache'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { templateSchema } from '@/lib/validation/schemas'
import type { Json, SectionType } from '@/lib/supabase/database.types'

export interface TemplateResult {
  ok: boolean
  error?: string
  templateId?: string
}

export interface TemplateSectionInput {
  section_type: SectionType
  title: string
  sort_order: number
  enabled: boolean
  config: Record<string, unknown>
}

export async function saveTemplateAction(input: {
  id?: string
  name: string
  description?: string
  is_default: boolean
  sections: TemplateSectionInput[]
}): Promise<TemplateResult> {
  const current = await requireRole(MANAGER_ROLES)

  const parsed = templateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid template' }
  }

  const supabase = await createClient()

  // Only one template may be the default; clear the flag elsewhere first so the
  // partial unique index cannot reject the write.
  if (parsed.data.is_default) {
    await supabase
      .from('report_templates')
      .update({ is_default: false })
      .eq('is_default', true)
      .neq('id', input.id ?? '00000000-0000-0000-0000-000000000000')
  }

  let templateId = input.id

  if (templateId) {
    const { error } = await supabase
      .from('report_templates')
      .update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_default: parsed.data.is_default,
      })
      .eq('id', templateId)

    if (error) return { ok: false, error: error.message }
  } else {
    const { data, error } = await supabase
      .from('report_templates')
      .insert({
        name: parsed.data.name,
        description: parsed.data.description || null,
        is_default: parsed.data.is_default,
        created_by: current.id,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create template' }
    templateId = data.id
  }

  // Sections are small and fully specified by the editor, so replacing them
  // wholesale is simpler and cheaper than diffing.
  await supabase.from('report_template_sections').delete().eq('template_id', templateId)

  const { error: sectionError } = await supabase.from('report_template_sections').insert(
    input.sections.map((section, index) => ({
      template_id: templateId!,
      section_type: section.section_type,
      title: section.title || null,
      sort_order: index,
      enabled: section.enabled,
      config: (section.config ?? {}) as Json,
    })),
  )

  if (sectionError) return { ok: false, error: sectionError.message }

  await recordAudit({
    actorId: current.id,
    action: input.id ? 'template.update' : 'template.create',
    entityType: 'report_template',
    entityId: templateId,
  })

  revalidatePath('/templates')
  return { ok: true, templateId }
}

export async function deleteTemplateAction(id: string): Promise<TemplateResult> {
  const current = await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const { error } = await supabase.from('report_templates').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  await recordAudit({
    actorId: current.id,
    action: 'template.delete',
    entityType: 'report_template',
    entityId: id,
  })

  revalidatePath('/templates')
  return { ok: true }
}
