import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isManager, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { JobProgress } from '@/features/reports/job-progress'
import { RegenerateButton } from '@/features/reports/regenerate-button'
import { formatBytes, formatDate } from '@/lib/utils'
import type { JobStatus } from '@/lib/supabase/database.types'

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { profile } = await requireUser()
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('generated_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!report) notFound()

  const [projectRes, versionsRes, jobsRes] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', report.project_id).maybeSingle(),
    supabase
      .from('report_versions')
      .select('*')
      .eq('generated_report_id', id)
      .order('version_no', { ascending: false }),
    supabase
      .from('report_jobs')
      .select('id, status, progress, step, error, report_version_id, created_at')
      .eq('generated_report_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const versions = versionsRes.data ?? []
  const jobs = (jobsRes.data ?? []) as Array<{
    id: string
    status: JobStatus
    progress: number
    step: string | null
    error: string | null
    report_version_id: string | null
  }>
  const latestJob = jobs[0]

  const filters = (report.filters ?? {}) as { only_approved?: boolean }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/reports" className="text-sm text-brand-600 hover:underline">
            ← Reports
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">{report.title}</h1>
          <p className="text-sm text-slate-500">
            {projectRes.data?.name ?? 'Project'} · {formatDate(report.date_from)} –{' '}
            {formatDate(report.date_to)}
            {filters.only_approved ? ' · approved only' : ''}
          </p>
        </div>
        {isManager(profile.role) ? <RegenerateButton generatedReportId={id} /> : null}
      </div>

      {latestJob ? (
        <JobProgress
          job={{
            id: latestJob.id,
            status: latestJob.status,
            progress: latestJob.progress,
            step: latestJob.step,
            error: latestJob.error,
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {versions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No versions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {versions.map((version) => {
                const ready = Boolean(version.storage_path)
                return (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Version {version.version_no}{' '}
                        <span className="uppercase text-slate-400">{version.format}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {ready
                          ? `${formatBytes(version.size_bytes ?? 0)}${
                              version.page_count ? ` · ${version.page_count} pages` : ''
                            }`
                          : 'Generating…'}
                      </p>
                    </div>

                    {ready ? (
                      <Button asChild variant="secondary" size="sm">
                        <a href={`/api/reports/download/${version.id}`}>Download</a>
                      </Button>
                    ) : (
                      <Badge tone="amber">Pending</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
