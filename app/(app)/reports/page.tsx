import Link from 'next/link'
import { isManager, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, EmptyState } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { JobStatus } from '@/lib/supabase/database.types'

export const metadata = { title: 'Reports · Report Generator' }

const JOB_TONE: Record<JobStatus, 'slate' | 'amber' | 'green' | 'red' | 'blue'> = {
  queued: 'slate',
  processing: 'amber',
  completed: 'green',
  failed: 'red',
  cancelled: 'slate',
}

export default async function ReportsPage() {
  const { profile } = await requireUser()
  const supabase = await createClient()

  const { data: reports } = await supabase
    .from('generated_reports')
    .select('id, title, project_id, date_from, date_to, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  const list = reports ?? []
  const reportIds = list.map((r) => r.id)

  const [projectsRes, jobsRes] = await Promise.all([
    supabase.from('projects').select('id, name'),
    reportIds.length > 0
      ? supabase
          .from('report_jobs')
          .select('generated_report_id, status, progress, created_at')
          .in('generated_report_id', reportIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const projectNames = new Map((projectsRes.data ?? []).map((p) => [p.id, p.name]))

  // Latest job per report drives the status chip.
  const latestJob = new Map<string, { status: JobStatus; progress: number }>()
  for (const job of (jobsRes.data ?? []) as Array<{
    generated_report_id: string
    status: JobStatus
    progress: number
  }>) {
    if (!latestJob.has(job.generated_report_id)) {
      latestJob.set(job.generated_report_id, { status: job.status, progress: job.progress })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Compiled project reports and their versions.</p>
        </div>
        {isManager(profile.role) ? (
          <Button asChild>
            <Link href="/reports/new">Build report</Link>
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Compile daily progress into a professional report over any date range."
          action={
            isManager(profile.role) ? (
              <Button asChild>
                <Link href="/reports/new">Build your first report</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((report) => {
            const job = latestJob.get(report.id)
            return (
              <li key={report.id}>
                <Link href={`/reports/${report.id}`}>
                  <Card className="transition-colors hover:border-brand-300">
                    <CardBody className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{report.title}</p>
                        <p className="text-sm text-slate-500">
                          {projectNames.get(report.project_id) ?? 'Project'} ·{' '}
                          {formatDate(report.date_from)} – {formatDate(report.date_to)}
                        </p>
                      </div>
                      {job ? (
                        <Badge tone={JOB_TONE[job.status]}>
                          {job.status === 'processing' ? `Building ${job.progress}%` : job.status}
                        </Badge>
                      ) : null}
                    </CardBody>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
