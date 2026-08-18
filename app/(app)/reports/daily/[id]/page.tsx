import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isManager, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signedUrlMap } from '@/lib/storage'
import { DailyReportEditor, type EditorLineItems } from '@/features/daily-reports/daily-report-editor'
import { FileUploader } from '@/features/attachments/file-uploader'
import {
  DocumentList,
  PhotoGallery,
  type GalleryItem,
} from '@/features/attachments/attachment-gallery'
import type { LineRow } from '@/features/daily-reports/line-item-section'
import type { Attachment } from '@/lib/supabase/database.types'

export const metadata = { title: 'Daily report · Report Generator' }

export default async function DailyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { id: userId, profile } = await requireUser()
  const supabase = await createClient()

  const { data: report } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!report) notFound()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', report.project_id)
    .maybeSingle()

  const [activities, issues, manpower, equipment, materials, attachments] = await Promise.all([
    supabase.from('activities').select('*').eq('daily_report_id', id).order('sort_order'),
    supabase.from('issues').select('*').eq('daily_report_id', id).order('sort_order'),
    supabase.from('manpower').select('*').eq('daily_report_id', id).order('sort_order'),
    supabase.from('equipment').select('*').eq('daily_report_id', id).order('sort_order'),
    supabase.from('materials').select('*').eq('daily_report_id', id).order('sort_order'),
    supabase
      .from('attachments')
      .select('*')
      .eq('daily_report_id', id)
      .order('sort_order')
      .order('created_at'),
  ])

  const files = (attachments.data ?? []) as Attachment[]
  const photos = files.filter((f) => f.kind === 'photo')
  const documents = files.filter((f) => f.kind !== 'photo')

  // Batch-sign in one round trip per bucket rather than per file.
  const [photoUrls, documentUrls] = await Promise.all([
    signedUrlMap(
      supabase,
      'photos',
      photos.map((p) => p.thumbnail_path ?? p.storage_path),
    ),
    signedUrlMap(
      supabase,
      'documents',
      documents.map((d) => d.storage_path),
    ),
  ])

  const toItem = (file: Attachment, urls: Record<string, string>, path: string): GalleryItem => ({
    id: file.id,
    file_name: file.file_name,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    caption: file.caption,
    url: urls[path] ?? null,
  })

  const initial: EditorLineItems = {
    activities: (activities.data ?? []) as unknown as LineRow[],
    issues: (issues.data ?? []) as unknown as LineRow[],
    manpower: (manpower.data ?? []) as unknown as LineRow[],
    equipment: (equipment.data ?? []) as unknown as LineRow[],
    materials: (materials.data ?? []) as unknown as LineRow[],
  }

  const manager = isManager(profile.role)
  // Mirrors the RLS rule: authors edit their own drafts; managers edit anytime.
  const canEdit =
    (report.author_id === userId && report.status === 'draft' && profile.role !== 'viewer') ||
    manager

  return (
    <div className="space-y-6">
      <Link
        href={project ? `/projects/${project.id}` : '/projects'}
        className="text-sm text-brand-600 hover:underline"
      >
        ← {project?.name ?? 'Project'}
      </Link>

      <DailyReportEditor
        report={report}
        projectName={project?.name ?? 'Project'}
        initial={initial}
        canEdit={canEdit}
        canReview={manager}
      />

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Photos</h2>
            <p className="text-xs text-slate-500">{photos.length} uploaded</p>
          </div>
          {canEdit ? (
            <FileUploader projectId={report.project_id} dailyReportId={id} kind="photo" />
          ) : null}
        </div>
        <PhotoGallery
          items={photos.map((p) => toItem(p, photoUrls, p.thumbnail_path ?? p.storage_path))}
          canEdit={canEdit}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Supporting documents</h2>
            <p className="text-xs text-slate-500">PDF, Word, Excel and more</p>
          </div>
          {canEdit ? (
            <FileUploader projectId={report.project_id} dailyReportId={id} kind="document" />
          ) : null}
        </div>
        <DocumentList
          items={documents.map((d) => toItem(d, documentUrls, d.storage_path))}
          canEdit={canEdit}
        />
      </section>
    </div>
  )
}
