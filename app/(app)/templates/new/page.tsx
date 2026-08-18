import Link from 'next/link'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { TemplateEditor } from '@/features/templates/template-editor'

export const metadata = { title: 'New template · Report Generator' }

export default async function NewTemplatePage() {
  await requireRole(MANAGER_ROLES)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/templates" className="text-sm text-brand-600 hover:underline">
          ← Templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">New template</h1>
      </div>
      <TemplateEditor />
    </div>
  )
}
