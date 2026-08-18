'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { generateReportAction } from './actions'
import { defaultSectionTitle } from '@/lib/reports/section-model'
import type { SectionType } from '@/lib/supabase/database.types'
import type { SectionConfig } from '@/lib/validation/schemas'

export interface BuilderSection {
  section_type: SectionType
  title: string
  sort_order: number
  enabled: boolean
  config: SectionConfig
}

export interface BuilderProject {
  id: string
  name: string
}

export interface BuilderTemplate {
  id: string
  name: string
  sections: BuilderSection[]
}

export function ReportBuilder({
  projects,
  templates,
  initialProjectId,
  defaultRange,
}: {
  projects: BuilderProject[]
  templates: BuilderTemplate[]
  initialProjectId?: string
  defaultRange: { from: string; to: string }
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const firstTemplate = templates[0]
  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? '')
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? '')
  const [title, setTitle] = useState('Project Progress Report')
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [onlyApproved, setOnlyApproved] = useState(false)
  const [sections, setSections] = useState<BuilderSection[]>(firstTemplate?.sections ?? [])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function onTemplateChange(id: string) {
    setTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (template) setSections(template.sections)
  }

  function updateSection(index: number, patch: Partial<BuilderSection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function updateConfig(index: number, patch: SectionConfig) {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, config: { ...s.config, ...patch } } : s)),
    )
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    setSections(next.map((s, i) => ({ ...s, sort_order: i })))
  }

  async function onGenerate() {
    setError(null)
    setPending(true)

    const result = await generateReportAction({
      project_id: projectId,
      template_id: templateId || null,
      title,
      date_from: dateFrom,
      date_to: dateTo,
      format: 'pdf',
      only_approved: onlyApproved,
      sections: sections
        .filter((s) => s.enabled)
        .map((s, index) => ({
          section_type: s.section_type,
          title: s.title,
          sort_order: index,
          enabled: true,
          config: s.config,
        })),
    })

    setPending(false)

    if (!result.ok || !result.generatedReportId) {
      setError(result.error ?? 'Could not start the report')
      return
    }

    startTransition(() => router.push(`/reports/${result.generatedReportId}`))
  }

  const enabledCount = sections.filter((s) => s.enabled).length

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Sections</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {sections.length === 0 ? (
              <p className="text-sm text-slate-500">
                This template has no sections. Pick another template or add sections in Templates.
              </p>
            ) : (
              sections.map((section, index) => (
                <div
                  key={`${section.section_type}-${index}`}
                  className="rounded-md border border-slate-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={(e) => updateSection(index, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span className="sr-only">Include section</span>
                    </label>

                    <Input
                      value={section.title}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                      className="max-w-xs flex-1"
                      placeholder={defaultSectionTitle(section.section_type)}
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
                        aria-label="Move section up"
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => move(index, 1)}
                        disabled={index === sections.length - 1}
                        aria-label="Move section down"
                      >
                        ↓
                      </Button>
                    </div>
                  </div>

                  {section.enabled && section.section_type === 'photos' ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Field label="Columns">
                        <Select
                          value={String(section.config.columns ?? 2)}
                          onChange={(e) =>
                            updateConfig(index, { columns: Number(e.target.value) })
                          }
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Max photos per day" hint="Blank = all">
                        <Input
                          type="number"
                          min={1}
                          value={section.config.maxPerDay ?? ''}
                          onChange={(e) =>
                            updateConfig(index, {
                              maxPerDay: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                        />
                      </Field>
                      <Field label="Captions">
                        <label className="flex h-10 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={section.config.showCaptions !== false}
                            onChange={(e) =>
                              updateConfig(index, { showCaptions: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Show captions
                        </label>
                      </Field>
                    </div>
                  ) : null}

                  {section.enabled && section.section_type === 'issues' ? (
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={section.config.includeResolved !== false}
                        onChange={(e) =>
                          updateConfig(index, { includeResolved: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Include resolved issues
                    </label>
                  ) : null}
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Report settings</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </Field>

            <Field label="Project">
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Template">
              <Select value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </Field>
              <Field label="To">
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyApproved}
                onChange={(e) => setOnlyApproved(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Only include approved daily reports
            </label>

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            <Button
              type="button"
              className="w-full"
              onClick={onGenerate}
              disabled={pending || !projectId || enabledCount === 0}
            >
              {pending ? 'Starting…' : `Generate PDF (${enabledCount} sections)`}
            </Button>

            <p className="text-xs text-slate-500">
              Generation runs in the background. You can leave this page — progress is shown on the
              report.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
