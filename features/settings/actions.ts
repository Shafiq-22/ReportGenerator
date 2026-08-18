'use server'

import { revalidatePath } from 'next/cache'
import { requireRole, requireUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { createClient } from '@/lib/supabase/server'
import { roleSchema, settingsSchema } from '@/lib/validation/schemas'

export interface SettingsState {
  ok?: boolean
  error?: string
}

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const current = await requireRole(['admin'])

  const parsed = settingsSchema.safeParse({ company_name: formData.get('company_name') ?? '' })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid settings' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .update({ company_name: parsed.data.company_name })
    .eq('id', true)

  if (error) return { error: error.message }

  await recordAudit({ actorId: current.id, action: 'settings.update', entityType: 'app_settings' })
  revalidatePath('/settings')
  return { ok: true }
}

export async function updateUserRoleAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const current = await requireRole(['admin'])

  const parsed = roleSchema.safeParse({
    user_id: formData.get('user_id') ?? '',
    role: formData.get('role') ?? '',
  })
  if (!parsed.success) return { error: 'Invalid role change' }

  // Guard against an admin removing their own admin rights and locking
  // everyone out of user management.
  if (parsed.data.user_id === current.id && parsed.data.role !== 'admin') {
    return { error: 'You cannot remove your own admin role.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id)

  if (error) return { error: error.message }

  await recordAudit({
    actorId: current.id,
    action: 'user.role_change',
    entityType: 'profile',
    entityId: parsed.data.user_id,
    metadata: { role: parsed.data.role },
  })

  revalidatePath('/settings')
  return { ok: true }
}

export async function updateOwnProfileAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const current = await requireUser()
  const fullName = String(formData.get('full_name') ?? '').trim()

  if (!fullName) return { error: 'Name is required' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', current.id)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}
