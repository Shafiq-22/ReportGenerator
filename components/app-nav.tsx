'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/lib/supabase/database.types'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/reports', label: 'Reports' },
  { href: '/templates', label: 'Templates', managerOnly: true },
  { href: '/settings', label: 'Settings' },
] as const

export function AppNav({ role }: { role: AppRole }) {
  const pathname = usePathname()
  const isManager = role === 'admin' || role === 'project_manager'

  return (
    <nav className="mx-auto max-w-7xl px-2">
      <ul className="no-scrollbar flex gap-1 overflow-x-auto">
        {NAV.filter((item) => !('managerOnly' in item && item.managerOnly) || isManager).map(
          (item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-600 hover:text-slate-900',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          },
        )}
      </ul>
    </nav>
  )
}
