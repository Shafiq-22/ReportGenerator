'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { projectSchema } from '@/lib/validation/schemas'

export interface ActionState {
  error?: string
  fieldErrors?: Record<string, string>
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const str = typeof value === 'string' ? value.trim() : ''
  return str === '' ? null : str
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireRole(MANAGER_ROLES)

  const parsed = projectSchema.safeParse({
    name: formData.get('name') ?? '',
    code: formData.get('code') ?? '',
    description: formData.get('description') ?? '',
    client_name: formData.get('client_name') ?? '',
    location: formData.get('location') ?? '',
    status: formData.get('status') ?? 'active',
    start_date: formData.get('start_date') ?? '',
    end_date: formData.get('end_date') ?? '',
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      fieldErrors[key] ??= issue.message
    }
    return { fieldErrors }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: parsed.data.name,
      code: emptyToNull(formData.get('code')),
      description: emptyToNull(formData.get('description')),
      client_name: emptyToNull(formData.get('client_name')),
      location: emptyToNull(formData.get('location')),
      status: parsed.data.status,
      start_date: emptyToNull(formData.get('start_date')),
      end_date: emptyToNull(formData.get('end_date')),
      created_by: current.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { fieldErrors: { code: 'That project code is already in use.' } }
    }
    return { error: error.message }
  }

  await recordAudit({
    actorId: current.id,
    action: 'project.create',
    entityType: 'project',
    entityId: data.id,
    metadata: { name: parsed.data.name },
  })

  revalidatePath('/projects')
  redirect(`/projects/${data.id}`)
}

export async function updateProjectAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = await requireRole(MANAGER_ROLES)

  const parsed = projectSchema.safeParse({
    name: formData.get('name') ?? '',
    code: formData.get('code') ?? '',
    description: formData.get('description') ?? '',
    client_name: formData.get('client_name') ?? '',
    location: formData.get('location') ?? '',
    status: formData.get('status') ?? 'active',
    start_date: formData.get('start_date') ?? '',
    end_date: formData.get('end_date') ?? '',
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form')
      fieldErrors[key] ??= issue.message
    }
    return { fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({
      name: parsed.data.name,
      code: emptyToNull(formData.get('code')),
      description: emptyToNull(formData.get('description')),
      client_name: emptyToNull(formData.get('client_name')),
      location: emptyToNull(formData.get('location')),
      status: parsed.data.status,
      start_date: emptyToNull(formData.get('start_date')),
      end_date: emptyToNull(formData.get('end_date')),
    })
    .eq('id', projectId)

  if (error) return { error: error.message }

  await recordAudit({
    actorId: current.id,
    action: 'project.update',
    entityType: 'project',
    entityId: projectId,
  })

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  return {}
}
