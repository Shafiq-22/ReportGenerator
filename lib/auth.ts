import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AppRole, Profile } from '@/lib/supabase/database.types'

export const MANAGER_ROLES: AppRole[] = ['admin', 'project_manager']
export const WRITER_ROLES: AppRole[] = ['admin', 'project_manager', 'field_user']

export interface CurrentUser {
  id: string
  email: string | null
  profile: Profile
}

/** Returns the signed-in staff member, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) return null

  return { id: user.id, email: user.email ?? null, profile }
}

/** Same as getCurrentUser but redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const current = await getCurrentUser()
  if (!current) redirect('/login')
  return current
}

/**
 * Requires one of `roles`. Sends unauthorized users back to the dashboard
 * rather than showing a dead end.
 *
 * This mirrors the RLS policy for the same action — the database remains the
 * real enforcement point; this just keeps the UI honest.
 */
export async function requireRole(roles: AppRole[]): Promise<CurrentUser> {
  const current = await requireUser()
  if (!roles.includes(current.profile.role)) redirect('/dashboard')
  return current
}

export function isManager(role: AppRole): boolean {
  return MANAGER_ROLES.includes(role)
}

export function canWrite(role: AppRole): boolean {
  return WRITER_ROLES.includes(role)
}

export function roleLabel(role: AppRole): string {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'project_manager':
      return 'Project Manager'
    case 'field_user':
      return 'Field User'
    case 'viewer':
      return 'Viewer'
  }
}
