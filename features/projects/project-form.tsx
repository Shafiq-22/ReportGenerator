'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import type { ActionState } from './actions'
import type { Project } from '@/lib/supabase/database.types'

export function ProjectForm({
  action,
  project,
  submitLabel = 'Save project',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  project?: Project
  submitLabel?: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <Field label="Project name" error={state.fieldErrors?.name}>
            <Input name="name" defaultValue={project?.name ?? ''} required maxLength={200} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Job code"
              hint="Optional. Must be unique."
              error={state.fieldErrors?.code}
            >
              <Input name="code" defaultValue={project?.code ?? ''} maxLength={50} />
            </Field>
            <Field label="Status" error={state.fieldErrors?.status}>
              <Select name="status" defaultValue={project?.status ?? 'active'}>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" error={state.fieldErrors?.client_name}>
              <Input name="client_name" defaultValue={project?.client_name ?? ''} maxLength={200} />
            </Field>
            <Field label="Location" error={state.fieldErrors?.location}>
              <Input name="location" defaultValue={project?.location ?? ''} maxLength={300} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" error={state.fieldErrors?.start_date}>
              <Input type="date" name="start_date" defaultValue={project?.start_date ?? ''} />
            </Field>
            <Field label="End date" error={state.fieldErrors?.end_date}>
              <Input type="date" name="end_date" defaultValue={project?.end_date ?? ''} />
            </Field>
          </div>

          <Field label="Description" error={state.fieldErrors?.description}>
            <Textarea name="description" defaultValue={project?.description ?? ''} rows={4} />
          </Field>

          {state.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
