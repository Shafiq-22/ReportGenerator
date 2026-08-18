import * as tus from 'tus-js-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Browser-side upload helpers.
 *
 * Files above this threshold go through Supabase's resumable (TUS) endpoint so
 * a dropped connection in the field resumes instead of restarting. Smaller
 * files use the simpler one-shot signed upload. Supabase requires exactly 6 MB
 * TUS chunks.
 */
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024
const TUS_CHUNK_SIZE = 6 * 1024 * 1024

/** Longest edge for uploaded photos. Keeps originals sane without visible loss. */
const MAX_IMAGE_EDGE = 2400
const JPEG_QUALITY = 0.85

export interface ImageInfo {
  file: File | Blob
  width: number | null
  height: number | null
  contentType: string
}

/**
 * PDF rendering supports only JPEG and PNG, so anything else (HEIC from
 * iPhones, WebP) is re-encoded here rather than failing later at report time.
 */
const PDF_SAFE_TYPES = new Set(['image/jpeg', 'image/png'])

/**
 * Downscales large photos in the browser before upload. Field phones produce
 * 8–12 MP images where ~2400px is plenty for a report, and this cuts upload
 * time dramatically on site connections.
 *
 * Falls back to the original file if anything about decoding fails.
 */
export async function prepareImage(file: File): Promise<ImageInfo> {
  if (!file.type.startsWith('image/')) {
    return { file, width: null, height: null, contentType: file.type }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const longest = Math.max(width, height)

    if (longest <= MAX_IMAGE_EDGE && PDF_SAFE_TYPES.has(file.type)) {
      bitmap.close()
      return { file, width, height, contentType: file.type }
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / longest)
    const targetWidth = Math.round(width * scale)
    const targetHeight = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { file, width, height, contentType: file.type }
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return { file, width, height, contentType: file.type }

    return {
      file: blob,
      width: targetWidth,
      height: targetHeight,
      contentType: 'image/jpeg',
    }
  } catch {
    return { file, width: null, height: null, contentType: file.type }
  }
}

export interface UploadParams {
  supabase: SupabaseClient<Database>
  bucket: string
  path: string
  token: string
  file: File | Blob
  contentType: string
  onProgress?: (percent: number) => void
}

export async function uploadToStorage(params: UploadParams): Promise<void> {
  if (params.file.size > RESUMABLE_THRESHOLD) {
    return uploadResumable(params)
  }

  const { error } = await params.supabase.storage
    .from(params.bucket)
    .uploadToSignedUrl(params.path, params.token, params.file, {
      contentType: params.contentType,
    })

  if (error) throw new Error(error.message)
  params.onProgress?.(100)
}

async function uploadResumable(params: UploadParams): Promise<void> {
  const {
    data: { session },
  } = await params.supabase.auth.getSession()

  if (!session) throw new Error('Your session expired. Please sign in again.')

  const endpoint = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(params.file, {
      endpoint,
      retryDelays: [0, 2000, 4000, 8000, 16000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: params.bucket,
        objectName: params.path,
        contentType: params.contentType,
      },
      onError: (error) => reject(error),
      onProgress: (sent, total) => {
        params.onProgress?.(Math.round((sent / total) * 100))
      },
      onSuccess: () => resolve(),
    })

    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0])
      upload.start()
    })
  })
}
