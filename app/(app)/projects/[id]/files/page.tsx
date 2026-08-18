import Link from 'next/link'
import { notFound } from 'next/navigation'
import { canWrite, requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signedUrlMap } from '@/lib/storage'
import { FileUploader } from '@/features/attachments/file-uploader'
import {
  DocumentList,
  PhotoGallery,
  type GalleryItem,
} from '@/features/attachments/attachment-gallery'
import type { Attachment } from '@/lib/supabase/database.types'

export const metadata = { title: 'Files · Report Generator' }

export default async function ProjectFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await requireUser()
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()

  if (!project) notFound()

  const { data } = await supabase
    .from('attachments')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  const files = (data ?? []) as Attachment[]
  const photos = files.filter((f) => f.kind === 'photo')
  const documents = files.filter((f) => f.kind !== 'photo')

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

  const editable = canWrite(profile.role)

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {project.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Files</h1>
        <p className="text-sm text-slate-500">
          {photos.length} photos · {documents.length} documents
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Photos</h2>
          {editable ? <FileUploader projectId={id} kind="photo" /> : null}
        </div>
        <PhotoGallery
          items={photos.map((p) => toItem(p, photoUrls, p.thumbnail_path ?? p.storage_path))}
          canEdit={editable}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
          {editable ? <FileUploader projectId={id} kind="document" /> : null}
        </div>
        <DocumentList
          items={documents.map((d) => toItem(d, documentUrls, d.storage_path))}
          canEdit={editable}
        />
      </section>
    </div>
  )
}
