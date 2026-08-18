import Link from 'next/link'
import { isManager, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardBody, EmptyState } from '@/components/ui/card'
import { ProjectStatusBadge } from '@/components/status-badge'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Projects · Report Generator' }

export default async function ProjectsPage() {
  const { profile } = await requireUser()
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code, client_name, location, status, start_date, end_date, updated_at')
    .order('status')
    .order('updated_at', { ascending: false })

  const list = projects ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">{list.length} total</p>
        </div>
        {isManager(profile.role) ? (
          <Button asChild>
            <Link href="/projects/new">New project</Link>
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={
            isManager(profile.role)
              ? 'Create your first project to start capturing daily progress.'
              : 'Ask a project manager to create a project and assign you to it.'
          }
          action={
            isManager(profile.role) ? (
              <Button asChild>
                <Link href="/projects/new">Create project</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
              <Card className="h-full transition-colors hover:border-brand-300">
                <CardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{project.name}</p>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  {project.code ? (
                    <p className="text-xs font-medium text-slate-500">{project.code}</p>
                  ) : null}
                  <dl className="space-y-1 text-sm text-slate-600">
                    {project.client_name ? <dd>{project.client_name}</dd> : null}
                    {project.location ? <dd className="text-slate-500">{project.location}</dd> : null}
                  </dl>
                  <p className="pt-1 text-xs text-slate-400">
                    {project.start_date ? `Started ${formatDate(project.start_date)}` : 'No start date'}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
