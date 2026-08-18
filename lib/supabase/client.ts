'use client'

import { createBrowserClient } from '@supabase/ssr'
import { supabaseAnonKey, supabaseUrl } from '@/lib/env'
import type { Database } from './database.types'

let cached: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Browser Supabase client. Uses the anon key plus the signed-in user's JWT,
 * so every query is subject to RLS.
 */
export function createClient() {
  if (!cached) {
    cached = createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey())
  }
  return cached
}
