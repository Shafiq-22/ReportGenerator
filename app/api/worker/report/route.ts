import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { workerSecret } from '@/lib/env'
import { generateReportVersion } from '@/lib/reports/generate'

/**
 * Background report worker.
 *
 * Runs on the Node runtime (never Edge) because PDF rendering needs the memory
 * and time headroom. Authenticated with a shared secret rather than a user
 * session — no user is present when the cron sweeper calls it.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Vercel caps this by plan; Pro/Fluid allows the extended window we want. */
export const maxDuration = 300

const MAX_ATTEMPTS = 3

export async function POST(request: NextRequest) {
  let secret: string
  try {
    secret = workerSecret()
  } catch {
    return NextResponse.json({ error: 'Worker is not configured' }, { status: 500 })
  }

  if (request.headers.get('x-worker-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { jobId?: string }
  const supabase = createAdminClient()

  // Pick the target job: either the one we were handed, or the oldest queued.
  let jobId = body.jobId
  if (!jobId) {
    const { data: next } = await supabase
      .from('report_jobs')
      .select('id')
      .eq('status', 'queued')
      .order('created_at')
      .limit(1)
      .maybeSingle()

    if (!next) return NextResponse.json({ status: 'idle' })
    jobId = next.id
  }

  // Claim it. The `.eq('status', 'queued')` filter makes this atomic: two
  // concurrent workers cannot both transition the same row, and the loser
  // simply gets no row back.
  const now = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from('report_jobs')
    .update({
      status: 'processing',
      locked_at: now,
      started_at: now,
      progress: 1,
      step: 'Starting',
    })
    .eq('id', jobId)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle()

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 })
  }
  if (!claimed) {
    // Already picked up by another invocation.
    return NextResponse.json({ status: 'noop' })
  }

  const attempts = claimed.attempts + 1
  await supabase.from('report_jobs').update({ attempts }).eq('id', claimed.id)

  try {
    const { data: version } = await supabase
      .from('report_versions')
      .select('id, version_no')
      .eq('id', claimed.report_version_id ?? '')
      .maybeSingle()

    if (!version) throw new Error('Report version row is missing')

    const result = await generateReportVersion(supabase, {
      jobId: claimed.id,
      generatedReportId: claimed.generated_report_id,
      versionId: version.id,
      versionNo: version.version_no,
    })

    await supabase
      .from('report_jobs')
      .update({
        status: 'completed',
        progress: 100,
        step: 'Complete',
        error: null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', claimed.id)

    return NextResponse.json({ status: 'completed', ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report generation failed'
    console.error('[worker] job failed', claimed.id, error)

    // Retry by returning the job to the queue until we run out of attempts;
    // the cron sweeper will pick it back up.
    const exhausted = attempts >= MAX_ATTEMPTS
    await supabase
      .from('report_jobs')
      .update({
        status: exhausted ? 'failed' : 'queued',
        error: message,
        step: exhausted ? 'Failed' : 'Waiting to retry',
        locked_at: null,
        finished_at: exhausted ? new Date().toISOString() : null,
      })
      .eq('id', claimed.id)

    return NextResponse.json({ status: exhausted ? 'failed' : 'requeued', error: message }, {
      status: 500,
    })
  }
}
