import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { siteUrl, workerSecret } from '@/lib/env'

/**
 * Safety net for the job queue.
 *
 * The happy path is that a Server Action triggers the worker directly. This
 * cron catches the rest: jobs whose trigger never landed, and jobs whose worker
 * died mid-render and left the row stuck in `processing`. Together they give
 * at-least-once execution without running a separate queue service.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A job holding its lease longer than this is presumed dead. */
const LEASE_MINUTES = 10

export async function GET(request: NextRequest) {
  let secret: string
  try {
    secret = workerSecret()
  } catch {
    return NextResponse.json({ error: 'Worker is not configured' }, { status: 500 })
  }

  const authorized =
    request.headers.get('x-worker-secret') === secret ||
    request.headers.get('authorization') === `Bearer ${secret}`

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const staleBefore = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString()

  // Reclaim abandoned work.
  const { data: reclaimed } = await supabase
    .from('report_jobs')
    .update({ status: 'queued', locked_at: null, step: 'Requeued after timeout' })
    .eq('status', 'processing')
    .lt('locked_at', staleBefore)
    .select('id')

  // Nudge the queue. One job per tick is enough: each run re-triggers the next.
  const { data: queued } = await supabase
    .from('report_jobs')
    .select('id')
    .eq('status', 'queued')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  let triggered: string | null = null
  if (queued) {
    triggered = queued.id
    try {
      await fetch(`${siteUrl()}/api/worker/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-worker-secret': secret },
        body: JSON.stringify({ jobId: queued.id }),
      })
    } catch (error) {
      console.error('[cron] could not trigger worker', error)
    }
  }

  return NextResponse.json({
    reclaimed: reclaimed?.length ?? 0,
    triggered,
  })
}
