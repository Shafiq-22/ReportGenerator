import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Writes an audit entry.
 *
 * Uses the service role deliberately: users must not be able to forge or
 * suppress their own audit trail, so `audit_logs` has no client insert policy.
 * Failures are logged but never block the user's action.
 */
export async function recordAudit(params: {
  actorId: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: (params.metadata ?? {}) as Json,
    })
  } catch (error) {
    console.error('[audit] failed to record entry', params.action, error)
  }
}
