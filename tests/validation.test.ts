import { describe, expect, it } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  bucketForKind,
  generateReportSchema,
  kindForMime,
  projectSchema,
  uploadRequestSchema,
} from '@/lib/validation/schemas'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('projectSchema', () => {
  it('requires a name', () => {
    const result = projectSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an end date before the start date', () => {
    const result = projectSchema.safeParse({
      name: 'Bridge',
      start_date: '2026-05-10',
      end_date: '2026-05-01',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('end_date')
    }
  })

  it('accepts a project with only a name', () => {
    expect(projectSchema.safeParse({ name: 'Bridge' }).success).toBe(true)
  })
})

describe('uploadRequestSchema', () => {
  const base = {
    project_id: UUID,
    file_name: 'site.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
  }

  it('accepts a normal photo', () => {
    expect(uploadRequestSchema.safeParse(base).success).toBe(true)
  })

  it('rejects unsupported file types', () => {
    const result = uploadRequestSchema.safeParse({
      ...base,
      mime_type: 'application/x-msdownload',
      file_name: 'virus.exe',
    })
    expect(result.success).toBe(false)
  })

  it('rejects photos over the size limit', () => {
    const result = uploadRequestSchema.safeParse({ ...base, size_bytes: MAX_PHOTO_BYTES + 1 })
    expect(result.success).toBe(false)
  })

  it('allows large documents that would be too big as photos', () => {
    const result = uploadRequestSchema.safeParse({
      ...base,
      file_name: 'drawings.pdf',
      mime_type: 'application/pdf',
      size_bytes: MAX_PHOTO_BYTES + 1,
    })
    expect(result.success).toBe(true)
  })
})

describe('kindForMime / bucketForKind', () => {
  it('routes photos and documents to the right buckets', () => {
    expect(kindForMime('image/png')).toBe('photo')
    expect(kindForMime('application/pdf')).toBe('document')
    expect(kindForMime('application/octet-stream')).toBe('other')
    expect(bucketForKind('photo')).toBe('photos')
    expect(bucketForKind('document')).toBe('documents')
    expect(bucketForKind('other')).toBe('documents')
  })
})

describe('generateReportSchema', () => {
  const base = {
    project_id: UUID,
    title: 'March Report',
    date_from: '2026-03-01',
    date_to: '2026-03-31',
    sections: [{ section_type: 'summary' as const, sort_order: 0, enabled: true, config: {} }],
  }

  it('accepts a valid request', () => {
    const result = generateReportSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.format).toBe('pdf')
      expect(result.data.only_approved).toBe(false)
    }
  })

  it('rejects an inverted date range', () => {
    const result = generateReportSchema.safeParse({
      ...base,
      date_from: '2026-03-31',
      date_to: '2026-03-01',
    })
    expect(result.success).toBe(false)
  })

  it('requires at least one section', () => {
    expect(generateReportSchema.safeParse({ ...base, sections: [] }).success).toBe(false)
  })

  it('clamps photo columns to the supported range', () => {
    const result = generateReportSchema.safeParse({
      ...base,
      sections: [
        { section_type: 'photos' as const, sort_order: 0, enabled: true, config: { columns: 9 } },
      ],
    })
    expect(result.success).toBe(false)
  })
})
