import Link from 'next/link'
import { requireUser, roleLabel } from '@/lib/auth'
import { AppNav } from '@/components/app-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, email } = await requireUser()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-brand-600 text-xs font-bold text-white">
              RG
            </span>
            <span className="text-sm font-semibold text-slate-900">Report Generator</span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-900">
                {profile.full_name ?? email ?? 'Account'}
              </p>
              <p className="text-xs text-slate-500">{roleLabel(profile.role)}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <AppNav role={profile.role} />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
