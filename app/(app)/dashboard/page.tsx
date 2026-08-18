import Link from 'next/link'
import { requireUser, isManager } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/card'
import { ReportStatusBadge, SeverityBadge } from '@/components/status-badge'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Dashboard · Report Generator' }

export default async function DashboardPage() {
  const { id: userId, profile } = await requireUser()
  const supabase = await createClient()

  const [projectsRes, recentRes, pendingRes, issuesRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, code, status, client_name, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(6),
    supabase
      .from('daily_reports')
      .select('id, report_date, status, project_id, projects(name)')
      .order('report_date', { ascending: false })
      .limit(8),
    supabase
      .from('daily_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted'),
    supabase
      .from('issues')
      .select('id, title, severity, status, daily_report_id')
      .neq('status', 'resolved')
      .order('severity', { ascending: false })
      .limit(5),
  ])

  const projects = projectsRes.data ?? []
  const recent = (recentRes.data ?? []) as Array<{
    id: string
    report_date: string
    status: 'draft' | 'submitted' | 'approved' | 'rejected'
    project_id: string
    projects: { name: string } | null
  }>
  const pendingCount = pendingRes.count ?? 0
  const openIssues = issuesRes.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Welcome back{profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-slate-500">Here is what is happening across your projects.</p>
        </div>
        <Button asChild>
          <Link href="/projects">New daily report</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active projects" value={projects.length} href="/projects" />
        <Stat
          label="Awaiting approval"
          value={pendingCount}
          href={isManager(profile.role) ? '/reports/approvals' : undefined}
        />
        <Stat label="Open issues" value={openIssues.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Recent daily reports</CardTitle>
            <Link href="/projects" className="text-sm text-brand-600 hover:underline">
              All projects
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {recent.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No daily reports yet"
                  description="Pick a project and log the first day of progress."
                  action={
                    <Button asChild variant="secondary">
                      <Link href="/projects">Go to projects</Link>
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/reports/daily/${report.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {report.projects?.name ?? 'Project'}
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(report.report_date)}</p>
                      </div>
                      <ReportStatusBadge status={report.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open issues</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {openIssues.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No open issues. </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {openIssues.map((issue) => (
                  <li key={issue.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <p className="text-sm text-slate-900">{issue.title}</p>
                    <SeverityBadge severity={issue.severity} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Active projects</CardTitle>
          <Link href="/projects" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardBody>
          {projects.length === 0 ? (
            <EmptyState
              title="No active projects"
              description="Create a project to start capturing daily progress."
              action={
                isManager(profile.role) ? (
                  <Button asChild>
                    <Link href="/projects/new">Create project</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <p className="truncate text-sm font-medium text-slate-900">{project.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {project.code ? `${project.code} · ` : ''}
                      {project.client_name ?? 'No client'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="sr-only">Signed in as {userId}</p>
    </div>
  )
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const content = (
    <Card className="h-full transition-colors hover:border-brand-300">
      <CardBody>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      </CardBody>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}
