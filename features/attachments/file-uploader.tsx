'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { prepareImage, uploadToStorage } from '@/lib/upload-client'
import { formatBytes } from '@/lib/utils'
import { DOCUMENT_MIME_TYPES, PHOTO_MIME_TYPES } from '@/lib/validation/schemas'
import { prepareUploadAction, registerAttachmentAction } from './actions'

type UploadState = {
  key: string
  name: string
  size: number
  percent: number
  error?: string
  done?: boolean
}

/**
 * Bulk uploader.
 *
 * Files upload in parallel with a small cap so a 40-photo batch from a phone
 * does not open 40 sockets at once. Each file is independent: one failure
 * never forces the whole batch to be redone.
 */
const MAX_PARALLEL = 3

export function FileUploader({
  projectId,
  dailyReportId,
  kind,
  disabled,
  label,
}: {
  projectId: string
  dailyReportId?: string | null
  kind: 'photo' | 'document'
  disabled?: boolean
  label?: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<UploadState[]>([])
  const [isPending, startTransition] = useTransition()

  const accept = (kind === 'photo' ? PHOTO_MIME_TYPES : DOCUMENT_MIME_TYPES).join(',')

  function update(key: string, patch: Partial<UploadState>) {
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...patch } : u)))
  }

  async function uploadOne(file: File, key: string) {
    const supabase = createClient()

    try {
      const prepared =
        kind === 'photo'
          ? await prepareImage(file)
          : {
              file,
              width: null,
              height: null,
              contentType: file.type || 'application/octet-stream',
            }

      const contentType = prepared.contentType || 'application/octet-stream'
      // Re-encoded images (HEIC/WebP → JPEG) need a matching extension so the
      // stored object and its recorded name agree.
      const fileName =
        contentType === 'image/jpeg' && !/\.jpe?g$/i.test(file.name)
          ? `${file.name.replace(/\.[^.]+$/, '')}.jpg`
          : file.name

      const prep = await prepareUploadAction({
        project_id: projectId,
        daily_report_id: dailyReportId ?? null,
        file_name: fileName,
        mime_type: contentType,
        size_bytes: prepared.file.size,
      })

      if (!prep.ok || !prep.target) throw new Error(prep.error ?? 'Upload was rejected')

      await uploadToStorage({
        supabase,
        bucket: prep.target.bucket,
        path: prep.target.path,
        token: prep.target.token,
        file: prepared.file,
        contentType,
        onProgress: (percent) => update(key, { percent }),
      })

      const registered = await registerAttachmentAction({
        id: prep.target.attachmentId,
        project_id: projectId,
        daily_report_id: dailyReportId ?? null,
        bucket: prep.target.bucket,
        storage_path: prep.target.path,
        file_name: fileName,
        mime_type: contentType,
        size_bytes: prepared.file.size,
        width: prepared.width,
        height: prepared.height,
      })

      if (!registered.ok) throw new Error(registered.error ?? 'Could not save the file record')

      update(key, { percent: 100, done: true })
    } catch (error) {
      update(key, { error: error instanceof Error ? error.message : 'Upload failed' })
    }
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)

    const queued: UploadState[] = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      size: file.size,
      percent: 0,
    }))
    setUploads((prev) => [...prev, ...queued])

    // Simple worker pool: keeps at most MAX_PARALLEL uploads in flight.
    let cursor = 0
    async function worker() {
      while (cursor < files.length) {
        const index = cursor++
        await uploadOne(files[index], queued[index].key)
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, files.length) }, worker))

    if (inputRef.current) inputRef.current.value = ''
    startTransition(() => router.refresh())
  }

  const active = uploads.filter((u) => !u.done || u.error)

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => void onFiles(e.target.files)}
        {...(kind === 'photo' ? { capture: undefined } : {})}
      />

      <Button
        type="button"
        variant="secondary"
        disabled={disabled || isPending}
        onClick={() => inputRef.current?.click()}
      >
        {label ?? (kind === 'photo' ? 'Add photos' : 'Add documents')}
      </Button>

      {active.length > 0 ? (
        <ul className="space-y-1.5">
          {active.map((upload) => (
            <li key={upload.key} className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{upload.name}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {upload.error ? 'Failed' : `${upload.percent}%`}
                </span>
              </div>
              {upload.error ? (
                <p className="mt-1 text-xs text-red-600">{upload.error}</p>
              ) : (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${upload.percent}%` }}
                  />
                </div>
              )}
              <p className="mt-1 text-xs text-slate-400">{formatBytes(upload.size)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
