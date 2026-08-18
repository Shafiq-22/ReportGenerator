import { requireUser, roleLabel } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { CompanyForm, ProfileForm, RoleForm } from '@/features/settings/settings-forms'
import type { Profile } from '@/lib/supabase/database.types'

export const metadata = { title: 'Settings · Report Generator' }

export default async function SettingsPage() {
  const { id: userId, profile } = await requireUser()
  const supabase = await createClient()
  const isAdmin = profile.role === 'admin'

  const [settingsRes, usersRes] = await Promise.all([
    supabase.from('app_settings').select('company_name').eq('id', true).maybeSingle(),
    isAdmin
      ? supabase.from('profiles').select('*').order('created_at')
      : Promise.resolve({ data: [] }),
  ])

  const users = (usersRes.data ?? []) as Profile[]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <ProfileForm fullName={profile.full_name ?? ''} />
            <p className="text-sm text-slate-500">
              Role: <span className="font-medium">{roleLabel(profile.role)}</span>
            </p>
          </CardBody>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardBody>
              <CompanyForm companyName={settingsRes.data?.company_name ?? 'Company'} />
            </CardBody>
          </Card>
        ) : null}
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>People & roles</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <ul className="divide-y divide-slate-100">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {user.full_name ?? 'Unnamed'}
                      {user.id === userId ? ' (you)' : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <RoleForm userId={user.id} role={user.role} disabled={user.id === userId} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
