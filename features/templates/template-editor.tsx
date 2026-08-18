'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/field'
import { defaultSectionTitle } from '@/lib/reports/section-model'
import { saveTemplateAction, type TemplateSectionInput } from './actions'
import type { SectionType } from '@/lib/supabase/database.types'

const SECTION_TYPES: SectionType[] = [
  'cover',
  'summary',
  'activities',
  'issues',
  'manpower',
  'equipment',
  'materials',
  'photos',
  'documents',
  'custom',
]

export function TemplateEditor({
  template,
}: {
  template?: {
    id: string
    name: string
    description: string | null
    is_default: boolean
    sections: TemplateSectionInput[]
  }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [name, setName] = useState(template?.name ?? 'New template')
  const [description, setDescription] = useState(template?.description ?? '')
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [sections, setSections] = useState<TemplateSectionInput[]>(
    template?.sections ?? [
      { section_type: 'cover', title: 'Cover', sort_order: 0, enabled: true, config: {} },
      { section_type: 'summary', title: 'Executive Summary', sort_order: 1, enabled: true, config: {} },
      { section_type: 'activities', title: 'Work Activities', sort_order: 2, enabled: true, config: {} },
      { section_type: 'photos', title: 'Photo Appendix', sort_order: 3, enabled: true, config: { columns: 2 } },
    ],
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSections(next.map((s, i) => ({ ...s, sort_order: i })))
  }

  function addSection(type: SectionType) {
    setSections((prev) => [
      ...prev,
      {
        section_type: type,
        title: defaultSectionTitle(type),
        sort_order: prev.length,
        enabled: true,
        config: {},
      },
    ])
  }

  async function onSave() {
    setPending(true)
    setError(null)
    setSaved(false)

    const result = await saveTemplateAction({
      id: template?.id,
      name,
      description,
      is_default: isDefault,
      sections: sections.map((s, i) => ({ ...s, sort_order: i })),
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not save the template')
      return
    }

    setSaved(true)
    startTransition(() => {
      router.refresh()
      if (!template?.id && result.templateId) router.push(`/templates/${result.templateId}`)
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Sections</CardTitle>
          <span className="text-xs text-slate-500">{sections.length} sections</span>
        </CardHeader>
        <CardBody className="space-y-3">
          {sections.map((section, index) => (
            <div
              key={`${section.section_type}-${index}`}
              className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3"
            >
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s, i) => (i === index ? { ...s, enabled: e.target.checked } : s)),
                  )
                }
                className="h-4 w-4 rounded border-slate-300"
                aria-label={`Include ${section.section_type}`}
              />
              <Input
                value={section.title}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)),
                  )
                }
                className="max-w-xs flex-1"
              />
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {section.section_type}
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move up"
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, 1)}
                  disabled={index === sections.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => setSections((prev) => prev.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            {SECTION_TYPES.filter(
              (type) => type === 'custom' || !sections.some((s) => s.section_type === type),
            ).map((type) => (
              <Button
                key={type}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => addSection(type)}
              >
                + {type}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Use as the default template
          </label>

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
          {saved ? <p className="text-sm text-green-700">Template saved.</p> : null}

          <Button type="button" className="w-full" onClick={onSave} disabled={pending}>
            {pending ? 'Saving…' : 'Save template'}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}

/** Kept here so the "new template" page can reuse the same select list. */
export { SECTION_TYPES }
