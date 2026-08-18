import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { supabaseServiceRoleKey, supabaseUrl } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for trusted server paths that cannot be expressed as the user:
 *   - the report-generation worker (reads every row in scope, writes exports)
 *   - writing audit_logs, which users must not be able to forge
 *
 * Never import this from a client component, and always perform your own
 * authorization check before using it on behalf of a request.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
