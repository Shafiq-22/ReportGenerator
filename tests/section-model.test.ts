import { describe, expect, it } from 'vitest'
import {
  aggregateEquipment,
  aggregateManpower,
  aggregateMaterials,
  attachPhotosToDays,
  computeTotals,
  defaultSectionTitle,
  issuesForSection,
  selectPhotos,
  type DayEntry,
  type ReportModel,
} from '@/lib/reports/section-model'
import type { Attachment } from '@/lib/supabase/database.types'

function day(overrides: Partial<DayEntry> = {}): DayEntry {
  return {
    id: overrides.id ?? 'day-1',
    report_date: overrides.report_date ?? '2026-03-01',
    status: 'approved',
    summary: null,
    weather: null,
    temperature: null,
    location: null,
    author_name: 'Sam Field',
    activities: [],
    issues: [],
    manpower: [],
    equipment: [],
    materials: [],
    photos: [],
    documents: [],
    ...overrides,
  }
}

describe('aggregateManpower', () => {
  it('sums man hours as hours x headcount and keeps trades separate', () => {
    const days = [
      day({
        id: 'd1',
        manpower: [
          { id: 'm1', daily_report_id: 'd1', trade: 'Electricians', contractor: null, headcount: 4, hours: 8, notes: null, sort_order: 0 },
          { id: 'm2', daily_report_id: 'd1', trade: 'Plumbers', contractor: null, headcount: 2, hours: 6, notes: null, sort_order: 1 },
        ],
      }),
      day({
        id: 'd2',
        report_date: '2026-03-02',
        manpower: [
          { id: 'm3', daily_report_id: 'd2', trade: 'Electricians', contractor: null, headcount: 3, hours: 8, notes: null, sort_order: 0 },
        ],
      }),
    ]

    const result = aggregateManpower(days)

    expect(result).toHaveLength(2)
    const electricians = result.find((r) => r.trade === 'Electricians')!
    expect(electricians.hours).toBe(4 * 8 + 3 * 8)
    expect(electricians.headcount).toBe(7)
    expect(electricians.days).toBe(2)
  })

  it('sorts by hours descending', () => {
    const days = [
      day({
        id: 'd1',
        manpower: [
          { id: 'm1', daily_report_id: 'd1', trade: 'Small', contractor: null, headcount: 1, hours: 1, notes: null, sort_order: 0 },
          { id: 'm2', daily_report_id: 'd1', trade: 'Big', contractor: null, headcount: 10, hours: 8, notes: null, sort_order: 1 },
        ],
      }),
    ]

    expect(aggregateManpower(days)[0].trade).toBe('Big')
  })

  it('handles missing hours without producing NaN', () => {
    const days = [
      day({
        id: 'd1',
        manpower: [
          { id: 'm1', daily_report_id: 'd1', trade: 'Labourers', contractor: null, headcount: 5, hours: null, notes: null, sort_order: 0 },
        ],
      }),
    ]

    expect(aggregateManpower(days)[0].hours).toBe(0)
  })
})

describe('aggregateEquipment', () => {
  it('keeps peak quantity but totals hours', () => {
    const days = [
      day({
        id: 'd1',
        equipment: [
          { id: 'e1', daily_report_id: 'd1', name: 'Excavator', quantity: 2, hours_used: 6, status: null, notes: null, sort_order: 0 },
        ],
      }),
      day({
        id: 'd2',
        equipment: [
          { id: 'e2', daily_report_id: 'd2', name: 'Excavator', quantity: 5, hours_used: 4, status: null, notes: null, sort_order: 0 },
        ],
      }),
    ]

    const [excavator] = aggregateEquipment(days)
    expect(excavator.quantity).toBe(5)
    expect(excavator.hours).toBe(10)
    expect(excavator.days).toBe(2)
  })
})

describe('aggregateMaterials', () => {
  it('groups by name and unit together', () => {
    const days = [
      day({
        id: 'd1',
        materials: [
          { id: 'x1', daily_report_id: 'd1', name: 'Concrete', quantity: 10, unit: 'm3', supplier: null, notes: null, sort_order: 0 },
          { id: 'x2', daily_report_id: 'd1', name: 'Concrete', quantity: 5, unit: 'm3', supplier: null, notes: null, sort_order: 1 },
          { id: 'x3', daily_report_id: 'd1', name: 'Concrete', quantity: 2, unit: 'tonnes', supplier: null, notes: null, sort_order: 2 },
        ],
      }),
    ]

    const result = aggregateMaterials(days)
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.unit === 'm3')!.quantity).toBe(15)
    expect(result.find((r) => r.unit === 'm3')!.deliveries).toBe(2)
  })
})

describe('computeTotals', () => {
  it('counts issues by severity and tracks open ones', () => {
    const days = [
      day({
        id: 'd1',
        issues: [
          { id: 'i1', daily_report_id: 'd1', title: 'A', description: null, severity: 'critical', status: 'open', delay_days: 2, resolved_at: null, sort_order: 0 },
          { id: 'i2', daily_report_id: 'd1', title: 'B', description: null, severity: 'low', status: 'resolved', delay_days: null, resolved_at: null, sort_order: 1 },
        ],
      }),
    ]

    const totals = computeTotals(days)
    expect(totals.issueCount).toBe(2)
    expect(totals.openIssueCount).toBe(1)
    expect(totals.issuesBySeverity.critical).toBe(1)
    expect(totals.totalDelayDays).toBe(2)
    expect(totals.dayCount).toBe(1)
  })

  it('returns zeroed totals for an empty period', () => {
    const totals = computeTotals([])
    expect(totals.dayCount).toBe(0)
    expect(totals.totalManHours).toBe(0)
    expect(totals.issuesBySeverity.high).toBe(0)
  })
})

describe('attachPhotosToDays', () => {
  function attachment(overrides: Partial<Attachment>): Attachment {
    return {
      id: 'a1',
      project_id: 'p1',
      daily_report_id: 'd1',
      kind: 'photo',
      bucket: 'photos',
      storage_path: 'p1/d1/a1.jpg',
      thumbnail_path: null,
      file_name: 'a1.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 100,
      width: null,
      height: null,
      taken_at: null,
      caption: null,
      sort_order: 0,
      uploaded_by: null,
      created_at: '2026-03-01T00:00:00Z',
      ...overrides,
    }
  }

  it('splits photos from documents and stamps the day date', () => {
    const days = [day({ id: 'd1', report_date: '2026-03-04' })]
    const { photos, documents } = attachPhotosToDays(days, [
      attachment({ id: 'a1' }),
      attachment({ id: 'a2', kind: 'document', bucket: 'documents', mime_type: 'application/pdf' }),
    ])

    expect(photos).toHaveLength(1)
    expect(documents).toHaveLength(1)
    expect(photos[0].report_date).toBe('2026-03-04')
    expect(days[0].photos).toHaveLength(1)
    expect(days[0].documents).toHaveLength(1)
  })

  it('prefers the thumbnail path when one exists', () => {
    const days = [day({ id: 'd1' })]
    const { photos } = attachPhotosToDays(days, [
      attachment({ thumbnail_path: 'p1/d1/thumb/a1.jpg' }),
    ])
    expect(photos[0].path).toBe('p1/d1/thumb/a1.jpg')
  })
})

describe('selectPhotos', () => {
  const model = {
    photos: [
      { id: '1', caption: null, file_name: 'a', bucket: 'photos', path: 'a', mime_type: 'image/jpeg', report_date: '2026-03-01' },
      { id: '2', caption: null, file_name: 'b', bucket: 'photos', path: 'b', mime_type: 'image/jpeg', report_date: '2026-03-01' },
      { id: '3', caption: null, file_name: 'c', bucket: 'photos', path: 'c', mime_type: 'image/jpeg', report_date: '2026-03-02' },
    ],
  } as unknown as ReportModel

  it('returns every photo when no cap is configured', () => {
    expect(selectPhotos(model, {})).toHaveLength(3)
  })

  it('caps photos per day, not overall', () => {
    const result = selectPhotos(model, { maxPerDay: 1 })
    expect(result).toHaveLength(2)
    expect(result.map((p) => p.id)).toEqual(['1', '3'])
  })
})

describe('issuesForSection', () => {
  const model = {
    days: [
      day({
        id: 'd1',
        issues: [
          { id: 'i1', daily_report_id: 'd1', title: 'Open', description: null, severity: 'high', status: 'open', delay_days: null, resolved_at: null, sort_order: 0 },
          { id: 'i2', daily_report_id: 'd1', title: 'Done', description: null, severity: 'low', status: 'resolved', delay_days: null, resolved_at: null, sort_order: 1 },
        ],
      }),
    ],
  } as unknown as ReportModel

  it('includes resolved issues by default', () => {
    expect(issuesForSection(model, {})).toHaveLength(2)
  })

  it('filters resolved issues when asked', () => {
    const result = issuesForSection(model, { includeResolved: false })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Open')
  })
})

describe('defaultSectionTitle', () => {
  it('names every section type', () => {
    expect(defaultSectionTitle('photos')).toBe('Photo Appendix')
    expect(defaultSectionTitle('issues')).toBe('Issues & Delays')
    expect(defaultSectionTitle('cover')).toBe('Cover')
  })
})
