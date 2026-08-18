import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { DOWNLOAD_TTL_SECONDS } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Hands out a short-lived signed URL for a finished report version.
 *
 * The bucket is private, so this route is the only way in: it checks the
 * session first, then mints a link that expires quickly.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const { versionId } = await params

  const current = await getCurrentUser()
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data: version } = await supabase
    .from('report_versions')
    .select('id, storage_path, generated_report_id, version_no, format')
    .eq('id', versionId)
    .maybeSingle()

  if (!version) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!version.storage_path) {
    return NextResponse.json({ error: 'This version is still being generated' }, { status: 409 })
  }

  const { data: signed, error } = await supabase.storage
    .from('report-exports')
    .createSignedUrl(version.storage_path, DOWNLOAD_TTL_SECONDS, { download: true })

  if (error || !signed) {
    return NextResponse.json({ error: 'Could not create a download link' }, { status: 500 })
  }

  await recordAudit({
    actorId: current.id,
    action: 'report.download',
    entityType: 'report_version',
    entityId: version.id,
    metadata: { version_no: version.version_no, format: version.format },
  })

  return NextResponse.redirect(signed.signedUrl)
}
