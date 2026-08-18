import 'server-only'

import { renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import pLimit from 'p-limit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { reportExportPath } from '@/lib/storage'
import { buildReportModel } from './build-model'
import { ReportDocument, type ImageAsset, type ImageAssets } from './pdf-document'
import type { DocumentEntry, PhotoEntry } from './section-model'

type Client = SupabaseClient<Database>

/**
 * How many images are fetched at once.
 *
 * This is the main memory lever: a report with 500 photos never holds more
 * than this many encoded images in flight, so peak memory stays flat as the
 * report grows.
 */
const IMAGE_CONCURRENCY = 6

/**
 * Hard cap on embedded photos. Beyond this a report stops being useful as a
 * document, and it protects the function from pathological scopes.
 */
const MAX_EMBEDDED_PHOTOS = 800

/** Native PDFs appended after the document index. */
const MAX_MERGED_PDFS = 50
const MAX_MERGED_PDF_BYTES = 40 * 1024 * 1024

export interface GenerateResult {
  storagePath: string
  sizeBytes: number
  pageCount: number | null
}

async function setProgress(
  supabase: Client,
  jobId: string,
  progress: number,
  step: string,
): Promise<void> {
  await supabase.from('report_jobs').update({ progress, step }).eq('id', jobId)
}

function imageFormat(mime: string): 'jpg' | 'png' | null {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/png') return 'png'
  return null
}

/**
 * Fetches photo bytes with bounded concurrency.
 *
 * Unsupported formats are skipped rather than failing the whole report — the
 * uploader normalises photos to JPEG, so this only catches legacy rows.
 */
async function loadImages(
  supabase: Client,
  photos: PhotoEntry[],
  onProgress: (done: number, total: number) => Promise<void>,
): Promise<ImageAssets> {
  const usable = photos.filter((photo) => imageFormat(photo.mime_type) !== null)
  const capped = usable.slice(0, MAX_EMBEDDED_PHOTOS)
  const assets: ImageAssets = new Map()

  if (capped.length === 0) return assets

  const limit = pLimit(IMAGE_CONCURRENCY)
  let done = 0
  let lastReported = 0

  await Promise.all(
    capped.map((photo) =>
      limit(async () => {
        try {
          const { data, error } = await supabase.storage.from(photo.bucket).download(photo.path)
          if (!error && data) {
            const format = imageFormat(photo.mime_type)
            if (format) {
              const buffer = Buffer.from(await data.arrayBuffer())
              assets.set(photo.id, { data: buffer, format })
            }
          }
        } catch (error) {
          // A single unreadable photo must not sink the whole report.
          console.error('[report] could not load photo', photo.id, error)
        } finally {
          done += 1
          // Report every ~5% instead of on every file.
          if (done - lastReported >= Math.max(1, Math.floor(capped.length / 20))) {
            lastReported = done
            await onProgress(done, capped.length)
          }
        }
      }),
    ),
  )

  return assets
}

async function loadLogo(supabase: Client): Promise<ImageAsset | undefined> {
  const { data: settings } = await supabase
    .from('app_settings')
    .select('logo_path')
    .eq('id', true)
    .maybeSingle()

  if (!settings?.logo_path) return undefined

  const { data, error } = await supabase.storage.from('branding').download(settings.logo_path)
  if (error || !data) return undefined

  const format = imageFormat(data.type)
  if (!format) return undefined

  return { data: Buffer.from(await data.arrayBuffer()), format }
}

/**
 * Appends native PDF attachments to the generated report.
 *
 * Merging with pdf-lib copies pages directly — no rasterising, no headless
 * browser. Word/Excel files are intentionally left as an index entry rather
 * than converted, which would require an office engine we do not run.
 */
async function appendPdfDocuments(
  supabase: Client,
  reportBuffer: Buffer,
  documents: DocumentEntry[],
): Promise<{ buffer: Buffer; pageCount: number }> {
  const pdfs = documents
    .filter((doc) => doc.mime_type === 'application/pdf')
    .filter((doc) => doc.size_bytes <= MAX_MERGED_PDF_BYTES)
    .slice(0, MAX_MERGED_PDFS)

  const merged = await PDFDocument.load(reportBuffer)

  for (const doc of pdfs) {
    try {
      const { data, error } = await supabase.storage.from(doc.bucket).download(doc.path)
      if (error || !data) continue

      const bytes = await data.arrayBuffer()
      // Some site PDFs are encrypted; ignoring encryption lets most still merge.
      const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const pages = await merged.copyPages(source, source.getPageIndices())
      for (const page of pages) merged.addPage(page)
    } catch (error) {
      console.error('[report] could not merge document', doc.id, error)
    }
  }

  const output = await merged.save()
  return { buffer: Buffer.from(output), pageCount: merged.getPageCount() }
}

/**
 * Renders one report version end to end and stores it.
 *
 * Called only from the background worker — never inline in a user request.
 */
export async function generateReportVersion(
  supabase: Client,
  params: { jobId: string; generatedReportId: string; versionId: string; versionNo: number },
): Promise<GenerateResult> {
  await setProgress(supabase, params.jobId, 5, 'Collecting report data')

  const model = await buildReportModel(supabase, params.generatedReportId)

  await setProgress(supabase, params.jobId, 15, 'Loading photos')

  const wantsPhotos = model.sections.some((section) => section.section_type === 'photos')
  const images = wantsPhotos
    ? await loadImages(supabase, model.photos, async (done, total) => {
        // Photo loading occupies the 15–60% band of the progress bar.
        const percent = 15 + Math.round((done / total) * 45)
        await setProgress(supabase, params.jobId, percent, `Loading photos (${done}/${total})`)
      })
    : new Map()

  const logo = await loadLogo(supabase)

  await setProgress(supabase, params.jobId, 65, 'Rendering PDF')

  let buffer = await renderToBuffer(
    <ReportDocument model={model} images={images} logo={logo} />,
  )
  let pageCount: number | null = null

  const wantsDocuments = model.sections.some((section) => section.section_type === 'documents')
  if (wantsDocuments && model.documents.length > 0) {
    await setProgress(supabase, params.jobId, 80, 'Appending documents')
    const appended = await appendPdfDocuments(supabase, buffer, model.documents)
    buffer = appended.buffer
    pageCount = appended.pageCount
  }

  await setProgress(supabase, params.jobId, 90, 'Uploading report')

  const storagePath = reportExportPath({
    projectId: model.project.id,
    generatedReportId: params.generatedReportId,
    versionNo: params.versionNo,
    format: 'pdf',
  })

  const { error: uploadError } = await supabase.storage
    .from('report-exports')
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true, // a retried job re-renders the same version deterministically
    })

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

  await supabase
    .from('report_versions')
    .update({
      storage_path: storagePath,
      size_bytes: buffer.byteLength,
      page_count: pageCount,
    })
    .eq('id', params.versionId)

  return { storagePath, sizeBytes: buffer.byteLength, pageCount }
}
