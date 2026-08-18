'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/lib/supabase/database.types'

export interface JobSnapshot {
  id: string
  status: JobStatus
  progress: number
  step: string | null
  error: string | null
}

/**
 * Live progress for a running report build.
 *
 * Subscribes to Postgres changes on the job row, so the bar moves as the worker
 * updates it — no polling. Falls back to whatever the server rendered if
 * Realtime is unavailable.
 */
export function JobProgress({ job }: { job: JobSnapshot }) {
  const router = useRouter()
  const [state, setState] = useState<JobSnapshot>(job)

  useEffect(() => {
    setState(job)
  }, [job])

  useEffect(() => {
    if (state.status === 'completed' || state.status === 'failed') return

    const supabase = createClient()
    const channel = supabase
      .channel(`report_job:${job.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'report_jobs', filter: `id=eq.${job.id}` },
        (payload) => {
          const next = payload.new as JobSnapshot
          setState(next)
          if (next.status === 'completed' || next.status === 'failed') {
            router.refresh()
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [job.id, state.status, router])

  if (state.status === 'completed') return null

  const failed = state.status === 'failed'

  return (
    <div
      className={
        failed
          ? 'rounded-lg border border-red-200 bg-red-50 p-4'
          : 'rounded-lg border border-brand-200 bg-brand-50 p-4'
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p className={failed ? 'text-sm font-medium text-red-800' : 'text-sm font-medium text-brand-800'}>
          {failed ? 'Report generation failed' : (state.step ?? 'Working…')}
        </p>
        {!failed ? <span className="text-sm text-brand-700">{state.progress}%</span> : null}
      </div>

      {!failed ? (
        <div className="mt-2 h-2 overflow-hidden rounded bg-white">
          <div
            className="h-full bg-brand-600 transition-all duration-500"
            style={{ width: `${Math.max(state.progress, 3)}%` }}
          />
        </div>
      ) : null}

      {state.error ? <p className="mt-2 text-sm text-red-700">{state.error}</p> : null}
    </div>
  )
}
