import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isManager, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { openDailyReportAction } from '@/features/daily-reports/actions'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@/components/ui/card'
import { ProjectStatusBadge, ReportStatusBadge } from '@/components/status-badge'
import { formatDate, toDateInput } from '@/lib/utils'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await requireUser()
  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  if (!project) notFound()

  const [reportsRes, filesRes] = await Promise.all([
    supabase
      .from('daily_reports')
      .select('id, report_date, status, summary, author_id, profiles!daily_reports_author_id_fkey(full_name)')
      .eq('project_id', id)
      .order('report_date', { ascending: false })
      .limit(30),
    supabase
      .from('attachments')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id),
  ])

  const reports = (reportsRes.data ?? []) as Array<{
    id: string
    report_date: string
    status: 'draft' | 'submitted' | 'approved' | 'rejected'
    summary: string | null
    author_id: string
    profiles: { full_name: string | null } | null
  }>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/projects" className="text-sm text-brand-600 hover:underline">
            ← Projects
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {[project.code, project.client_name, project.location].filter(Boolean).join(' · ') ||
              'No client or location set'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`/projects/${id}/files`}>Files ({filesRes.count ?? 0})</Link>
          </Button>
          {isManager(profile.role) ? (
            <Button asChild variant="secondary">
              <Link href={`/reports/new?project=${id}`}>Build report</Link>
            </Button>
          ) : null}
          <form action={openDailyReportAction}>
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="report_date" value={toDateInput()} />
            <Button type="submit">Today&apos;s report</Button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Detail label="Start" value={formatDate(project.start_date)} />
        <Detail label="End" value={formatDate(project.end_date)} />
        <Detail label="Daily reports" value={String(reports.length)} />
        <Detail label="Files" value={String(filesRes.count ?? 0)} />
      </div>

      {project.description ? (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{project.description}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Daily reports</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {reports.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No daily reports yet"
                description="Start logging progress for this project."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/reports/daily/${report.id}`}
                    className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {formatDate(report.report_date)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {report.profiles?.full_name ?? 'Unknown author'}
                        {report.summary ? ` · ${report.summary.slice(0, 80)}` : ''}
                      </p>
                    </div>
                    <ReportStatusBadge status={report.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="py-3">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
      </CardBody>
    </Card>
  )
}
