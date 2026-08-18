import Link from 'next/link'
import { MANAGER_ROLES, requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardBody, EmptyState } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { DailyReport, Profile, Project } from '@/lib/supabase/database.types'

export const metadata = { title: 'Approvals · Report Generator' }

export default async function ApprovalsPage() {
  await requireRole(MANAGER_ROLES)
  const supabase = await createClient()

  const { data } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('status', 'submitted')
    .order('report_date', { ascending: false })

  const reports = (data ?? []) as DailyReport[]

  const [projectsRes, authorsRes] =
    reports.length === 0
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from('projects')
            .select('id, name')
            .in('id', [...new Set(reports.map((r) => r.project_id))]),
          supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', [...new Set(reports.map((r) => r.author_id))]),
        ])

  const projectNames = new Map(
    ((projectsRes.data ?? []) as Pick<Project, 'id' | 'name'>[]).map((p) => [p.id, p.name]),
  )
  const authorNames = new Map(
    ((authorsRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((a) => [
      a.id,
      a.full_name,
    ]),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Awaiting approval</h1>
        <p className="text-sm text-slate-500">{reports.length} submitted daily reports</p>
      </div>

      {reports.length === 0 ? (
        <EmptyState title="Nothing to review" description="Submitted reports will appear here." />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link href={`/reports/daily/${report.id}`}>
                <Card className="transition-colors hover:border-brand-300">
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {projectNames.get(report.project_id) ?? 'Project'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(report.report_date)} ·{' '}
                        {authorNames.get(report.author_id) ?? 'Unknown author'}
                      </p>
                    </div>
                    <span className="text-sm text-brand-600">Review →</span>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
