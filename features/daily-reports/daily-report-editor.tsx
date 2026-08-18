'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { ReportStatusBadge } from '@/components/status-badge'
import { LineItemSection, type FieldDef, type LineRow } from './line-item-section'
import {
  copyPreviousDayAction,
  reviewDailyReportAction,
  saveDailyReportAction,
  submitDailyReportAction,
} from './actions'
import type { DailyReport } from '@/lib/supabase/database.types'

const AUTOSAVE_DELAY_MS = 1500

export interface EditorLineItems {
  activities: LineRow[]
  issues: LineRow[]
  manpower: LineRow[]
  equipment: LineRow[]
  materials: LineRow[]
}

type SaveIndicator = 'idle' | 'saving' | 'saved' | 'error'

const ACTIVITY_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Activity', span: 3, placeholder: 'e.g. Second floor conduit rough-in' },
  { name: 'category', label: 'Category', span: 2, placeholder: 'Electrical' },
  { name: 'percent_complete', label: '% complete', kind: 'number', min: 0, max: 100, span: 1 },
  { name: 'description', label: 'Details', kind: 'textarea', span: 6 },
]

const ISSUE_FIELDS: FieldDef[] = [
  { name: 'title', label: 'Issue', span: 3, placeholder: 'e.g. Late delivery of switchgear' },
  {
    name: 'severity',
    label: 'Severity',
    kind: 'select',
    span: 1,
    options: [
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
      { value: 'critical', label: 'Critical' },
    ],
  },
  {
    name: 'status',
    label: 'Status',
    kind: 'select',
    span: 1,
    options: [
      { value: 'open', label: 'Open' },
      { value: 'monitoring', label: 'Monitoring' },
      { value: 'resolved', label: 'Resolved' },
    ],
  },
  { name: 'delay_days', label: 'Delay (days)', kind: 'number', min: 0, step: '0.5', span: 1 },
  { name: 'description', label: 'Details', kind: 'textarea', span: 6 },
]

const MANPOWER_FIELDS: FieldDef[] = [
  { name: 'trade', label: 'Trade', span: 2, placeholder: 'Electricians' },
  { name: 'contractor', label: 'Contractor', span: 2 },
  { name: 'headcount', label: 'Headcount', kind: 'number', min: 0, span: 1 },
  { name: 'hours', label: 'Hours', kind: 'number', min: 0, max: 24, step: '0.5', span: 1 },
  { name: 'notes', label: 'Notes', kind: 'textarea', span: 6 },
]

const EQUIPMENT_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Equipment', span: 2, placeholder: '20t excavator' },
  { name: 'quantity', label: 'Qty', kind: 'number', min: 0, span: 1 },
  { name: 'hours_used', label: 'Hours used', kind: 'number', min: 0, max: 24, step: '0.5', span: 1 },
  { name: 'status', label: 'Status', span: 2, placeholder: 'Operational' },
  { name: 'notes', label: 'Notes', kind: 'textarea', span: 6 },
]

const MATERIAL_FIELDS: FieldDef[] = [
  { name: 'name', label: 'Material', span: 2, placeholder: 'Ready-mix concrete' },
  { name: 'quantity', label: 'Quantity', kind: 'number', min: 0, span: 1 },
  { name: 'unit', label: 'Unit', span: 1, placeholder: 'm³' },
  { name: 'supplier', label: 'Supplier', span: 2 },
  { name: 'notes', label: 'Notes', kind: 'textarea', span: 6 },
]

function newRow(sortOrder: number, extra: Record<string, unknown> = {}): LineRow {
  return { id: crypto.randomUUID(), sort_order: sortOrder, ...extra }
}

/** Strips empty strings to null so numeric/optional columns store cleanly. */
function normalizeRows(rows: LineRow[]): Record<string, unknown>[] {
  return rows.map((row, index) => {
    const out: Record<string, unknown> = { ...row, sort_order: index }
    for (const [key, value] of Object.entries(out)) {
      if (value === '') out[key] = null
    }
    return out
  })
}

export function DailyReportEditor({
  report,
  projectName,
  initial,
  canEdit,
  canReview,
}: {
  report: DailyReport
  projectName: string
  initial: EditorLineItems
  canEdit: boolean
  canReview: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [fields, setFields] = useState({
    report_date: report.report_date,
    weather: report.weather ?? '',
    temperature: report.temperature?.toString() ?? '',
    location: report.location ?? '',
    summary: report.summary ?? '',
  })
  const [rows, setRows] = useState<EditorLineItems>(initial)
  const [indicator, setIndicator] = useState<SaveIndicator>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Skips the autosave that would otherwise fire from the initial render.
  const hydrated = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async () => {
    setIndicator('saving')
    const result = await saveDailyReportAction({
      report: {
        id: report.id,
        report_date: fields.report_date,
        weather: fields.weather,
        temperature: fields.temperature === '' ? null : Number(fields.temperature),
        location: fields.location,
        summary: fields.summary,
      },
      activities: normalizeRows(rows.activities) as never,
      issues: normalizeRows(rows.issues) as never,
      manpower: normalizeRows(rows.manpower) as never,
      equipment: normalizeRows(rows.equipment) as never,
      materials: normalizeRows(rows.materials) as never,
    })

    if (result.ok) {
      setIndicator('saved')
      setMessage(null)
    } else {
      setIndicator('error')
      setMessage(result.error ?? 'Could not save')
    }
  }, [fields, rows, report.id])

  useEffect(() => {
    if (!canEdit) return
    if (!hydrated.current) {
      hydrated.current = true
      return
    }

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [fields, rows, canEdit, save])

  const savedLabel = useMemo(() => {
    switch (indicator) {
      case 'saving':
        return 'Saving…'
      case 'saved':
        return 'All changes saved'
      case 'error':
        return message ?? 'Save failed'
      default:
        return report.autosaved_at ? 'Draft saved' : 'Not saved yet'
    }
  }, [indicator, message, report.autosaved_at])

  async function onSubmitReport() {
    setBusy(true)
    if (timer.current) clearTimeout(timer.current)
    await save()
    const result = await submitDailyReportAction(report.id)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'Could not submit')
      setIndicator('error')
      return
    }
    startTransition(() => router.refresh())
  }

  async function onReview(decision: 'approved' | 'rejected') {
    setBusy(true)
    const result = await reviewDailyReportAction(report.id, decision)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'Could not update')
      setIndicator('error')
      return
    }
    startTransition(() => router.refresh())
  }

  async function onCopyPrevious() {
    setBusy(true)
    const result = await copyPreviousDayAction(report.id, false)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'Nothing to copy')
      setIndicator('error')
      return
    }
    setMessage(`Copied ${result.copied ?? 0} rows from the previous report.`)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{projectName}</p>
          <h1 className="text-xl font-semibold text-slate-900">Daily report</h1>
        </div>
        <div className="flex items-center gap-2">
          <ReportStatusBadge status={report.status} />
        </div>
      </div>

      {message ? (
        <p
          className={
            indicator === 'error'
              ? 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700'
              : 'rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700'
          }
        >
          {message}
        </p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Date">
            <Input
              type="date"
              value={fields.report_date}
              disabled={!canEdit}
              onChange={(e) => setFields((f) => ({ ...f, report_date: e.target.value }))}
            />
          </Field>
          <Field label="Weather">
            <Input
              value={fields.weather}
              disabled={!canEdit}
              placeholder="Clear, light wind"
              onChange={(e) => setFields((f) => ({ ...f, weather: e.target.value }))}
            />
          </Field>
          <Field label="Temp (°C)">
            <Input
              type="number"
              inputMode="decimal"
              value={fields.temperature}
              disabled={!canEdit}
              onChange={(e) => setFields((f) => ({ ...f, temperature: e.target.value }))}
            />
          </Field>
          <Field label="Location">
            <Input
              value={fields.location}
              disabled={!canEdit}
              placeholder="Block B, level 2"
              onChange={(e) => setFields((f) => ({ ...f, location: e.target.value }))}
            />
          </Field>
        </div>

        <Field label="Progress summary" className="mt-4">
          <Textarea
            rows={5}
            value={fields.summary}
            disabled={!canEdit}
            placeholder="What happened on site today?"
            onChange={(e) => setFields((f) => ({ ...f, summary: e.target.value }))}
          />
        </Field>

        {canEdit ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCopyPrevious} disabled={busy}>
              Copy previous day
            </Button>
          </div>
        ) : null}
      </section>

      <LineItemSection
        title="Activities"
        description="Work carried out today."
        fields={ACTIVITY_FIELDS}
        rows={rows.activities}
        disabled={!canEdit}
        addLabel="Add activity"
        makeRow={(i) => newRow(i, { title: '' })}
        onChange={(next) => setRows((r) => ({ ...r, activities: next }))}
      />

      <LineItemSection
        title="Issues & delays"
        description="Anything blocking or slowing the work."
        fields={ISSUE_FIELDS}
        rows={rows.issues}
        disabled={!canEdit}
        addLabel="Add issue"
        makeRow={(i) => newRow(i, { title: '', severity: 'medium', status: 'open' })}
        onChange={(next) => setRows((r) => ({ ...r, issues: next }))}
      />

      <LineItemSection
        title="Manpower"
        fields={MANPOWER_FIELDS}
        rows={rows.manpower}
        disabled={!canEdit}
        addLabel="Add trade"
        makeRow={(i) => newRow(i, { trade: '', headcount: 0 })}
        onChange={(next) => setRows((r) => ({ ...r, manpower: next }))}
      />

      <LineItemSection
        title="Equipment"
        fields={EQUIPMENT_FIELDS}
        rows={rows.equipment}
        disabled={!canEdit}
        addLabel="Add equipment"
        makeRow={(i) => newRow(i, { name: '', quantity: 1 })}
        onChange={(next) => setRows((r) => ({ ...r, equipment: next }))}
      />

      <LineItemSection
        title="Materials"
        fields={MATERIAL_FIELDS}
        rows={rows.materials}
        disabled={!canEdit}
        addLabel="Add material"
        makeRow={(i) => newRow(i, { name: '' })}
        onChange={(next) => setRows((r) => ({ ...r, materials: next }))}
      />

      {/* Sticky action bar: the save state must always be visible on mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <p
            className={
              indicator === 'error' ? 'text-sm text-red-600' : 'text-sm text-slate-500'
            }
          >
            {savedLabel}
          </p>
          <div className="flex gap-2">
            {canEdit ? (
              <>
                <Button type="button" variant="secondary" onClick={() => void save()} disabled={busy}>
                  Save draft
                </Button>
                {report.status === 'draft' ? (
                  <Button type="button" onClick={onSubmitReport} disabled={busy}>
                    Submit
                  </Button>
                ) : null}
              </>
            ) : null}
            {canReview && report.status === 'submitted' ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onReview('rejected')}
                  disabled={busy}
                >
                  Reject
                </Button>
                <Button type="button" onClick={() => onReview('approved')} disabled={busy}>
                  Approve
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
