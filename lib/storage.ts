import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Client = SupabaseClient<Database>

/** Default view TTL. Short by design — links are minted per request. */
export const VIEW_TTL_SECONDS = 300
export const DOWNLOAD_TTL_SECONDS = 60 * 15

export async function signedUrl(
  supabase: Client,
  bucket: string,
  path: string,
  expiresIn = VIEW_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) return null
  return data.signedUrl
}

/**
 * Batch-signs many paths in one round trip. Returns a path → URL map so
 * callers can look up by the path stored on the attachment row.
 */
export async function signedUrlMap(
  supabase: Client,
  bucket: string,
  paths: string[],
  expiresIn = VIEW_TTL_SECONDS,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return {}

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresIn)
  if (error || !data) return {}

  const map: Record<string, string> = {}
  for (const entry of data) {
    if (entry.signedUrl && entry.path) map[entry.path] = entry.signedUrl
  }
  return map
}

/** Storage path for an attachment. Prefixing by project keeps cleanup simple. */
export function attachmentPath(params: {
  projectId: string
  dailyReportId: string | null
  attachmentId: string
  extension: string
}): string {
  const scope = params.dailyReportId ?? 'project'
  const ext = params.extension ? `.${params.extension}` : ''
  return `${params.projectId}/${scope}/${params.attachmentId}${ext}`
}

export function reportExportPath(params: {
  projectId: string
  generatedReportId: string
  versionNo: number
  format: 'pdf' | 'docx'
}): string {
  return `${params.projectId}/${params.generatedReportId}/v${params.versionNo}.${params.format}`
}
