import Link from 'next/link'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { createProjectAction } from '@/features/projects/actions'
import { ProjectForm } from '@/features/projects/project-form'

export const metadata = { title: 'New project · Report Generator' }

export default async function NewProjectPage() {
  await requireRole(MANAGER_ROLES)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-brand-600 hover:underline">
          ← Back to projects
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">New project</h1>
      </div>
      <ProjectForm action={createProjectAction} submitLabel="Create project" />
    </div>
  )
}
