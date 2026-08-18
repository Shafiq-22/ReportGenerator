'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/field'
import {
  updateOwnProfileAction,
  updateSettingsAction,
  updateUserRoleAction,
  type SettingsState,
} from './actions'
import type { AppRole } from '@/lib/supabase/database.types'

export function CompanyForm({ companyName }: { companyName: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    {},
  )

  return (
    <form action={action} className="space-y-3">
      <Field label="Company name" hint="Shown on report covers." error={state.error}>
        <Input name="company_name" defaultValue={companyName} required maxLength={200} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state.ok ? <span className="text-sm text-green-700">Saved.</span> : null}
      </div>
    </form>
  )
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateOwnProfileAction,
    {},
  )

  return (
    <form action={action} className="space-y-3">
      <Field label="Your name" error={state.error}>
        <Input name="full_name" defaultValue={fullName} required maxLength={200} />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {state.ok ? <span className="text-sm text-green-700">Saved.</span> : null}
      </div>
    </form>
  )
}

export function RoleForm({
  userId,
  role,
  disabled,
}: {
  userId: string
  role: AppRole
  disabled?: boolean
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateUserRoleAction,
    {},
  )

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <Select
        name="role"
        defaultValue={role}
        disabled={disabled || pending}
        className="w-44"
      >
        <option value="admin">Admin</option>
        <option value="project_manager">Project Manager</option>
        <option value="field_user">Field User</option>
        <option value="viewer">Viewer</option>
      </Select>
      <Button type="submit" variant="secondary" size="sm" disabled={disabled || pending}>
        {pending ? '…' : 'Update'}
      </Button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  )
}
