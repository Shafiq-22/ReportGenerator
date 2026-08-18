'use client'

import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/field'
import { cn } from '@/lib/utils'

export type FieldKind = 'text' | 'number' | 'textarea' | 'select'

export interface FieldDef {
  name: string
  label: string
  kind?: FieldKind
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  min?: number
  max?: number
  step?: string
  /** Tailwind grid span on desktop (1–6). */
  span?: number
}

export type LineRow = Record<string, unknown> & { id: string; sort_order: number }

/**
 * Renders a repeatable group of rows (activities, issues, manpower, …).
 *
 * One config-driven component instead of five near-identical ones: the shapes
 * differ only in their field definitions.
 */
export function LineItemSection({
  title,
  description,
  fields,
  rows,
  onChange,
  disabled,
  addLabel,
  makeRow,
}: {
  title: string
  description?: string
  fields: FieldDef[]
  rows: LineRow[]
  onChange: (rows: LineRow[]) => void
  disabled?: boolean
  addLabel: string
  makeRow: (sortOrder: number) => LineRow
}) {
  function updateRow(id: string, name: string, value: string) {
    onChange(rows.map((row) => (row.id === id ? { ...row, [name]: value } : row)))
  }

  function removeRow(id: string) {
    onChange(
      rows
        .filter((row) => row.id !== id)
        .map((row, index) => ({ ...row, sort_order: index })),
    )
  }

  function move(id: string, direction: -1 | 1) {
    const index = rows.findIndex((row) => row.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((row, i) => ({ ...row, sort_order: i })))
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        </div>
        <span className="text-xs text-slate-400">{rows.length}</span>
      </div>

      <div className="space-y-3 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={row.id}
              className="rounded-md border border-slate-200 bg-slate-50/60 p-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                {fields.map((field) => (
                  <div
                    key={field.name}
                    className={cn('sm:col-span-2', field.span === 6 && 'sm:col-span-6',
                      field.span === 3 && 'sm:col-span-3',
                      field.span === 1 && 'sm:col-span-1')}
                  >
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {field.label}
                    </label>
                    {field.kind === 'textarea' ? (
                      <Textarea
                        rows={2}
                        disabled={disabled}
                        placeholder={field.placeholder}
                        value={String(row[field.name] ?? '')}
                        onChange={(e) => updateRow(row.id, field.name, e.target.value)}
                      />
                    ) : field.kind === 'select' ? (
                      <Select
                        disabled={disabled}
                        value={String(row[field.name] ?? '')}
                        onChange={(e) => updateRow(row.id, field.name, e.target.value)}
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        type={field.kind === 'number' ? 'number' : 'text'}
                        inputMode={field.kind === 'number' ? 'decimal' : undefined}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        disabled={disabled}
                        placeholder={field.placeholder}
                        value={String(row[field.name] ?? '')}
                        onChange={(e) => updateRow(row.id, field.name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>

              {!disabled ? (
                <div className="mt-2 flex items-center justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => move(row.id, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => move(row.id, 1)}
                    disabled={index === rows.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => removeRow(row.id)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}

        {!disabled ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange([...rows, makeRow(rows.length)])}
          >
            {addLabel}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
