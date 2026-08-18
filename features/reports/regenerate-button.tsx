'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { regenerateReportAction } from './actions'

/** Builds a new version of an existing report definition. */
export function RegenerateButton({ generatedReportId }: { generatedReportId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function onClick() {
    setPending(true)
    setError(null)
    const result = await regenerateReportAction(generatedReportId, 'pdf')
    setPending(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not start the rebuild')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="text-right">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        {pending ? 'Starting…' : 'Rebuild'}
      </Button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
