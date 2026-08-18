'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { formatBytes } from '@/lib/utils'
import { deleteAttachmentAction, updateAttachmentAction } from './actions'

export interface GalleryItem {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  caption: string | null
  url: string | null
}

export function PhotoGallery({
  items,
  canEdit,
}: {
  items: GalleryItem[]
  canEdit: boolean
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No photos yet.</p>
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => (
        <PhotoCard key={item.id} item={item} canEdit={canEdit} />
      ))}
    </ul>
  )
}

function PhotoCard({ item, canEdit }: { item: GalleryItem; canEdit: boolean }) {
  const router = useRouter()
  const [caption, setCaption] = useState(item.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()

  async function saveCaption() {
    if (caption === (item.caption ?? '')) return
    setSaving(true)
    await updateAttachmentAction(item.id, { caption })
    setSaving(false)
    startTransition(() => router.refresh())
  }

  async function remove() {
    if (!confirm(`Delete ${item.file_name}? This cannot be undone.`)) return
    await deleteAttachmentAction(item.id)
    startTransition(() => router.refresh())
  }

  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="aspect-4/3 bg-slate-100">
        {item.url ? (
          // Signed URLs are short-lived and host-varying; the plain img tag
          // avoids next/image remote-pattern config for every environment.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.caption || item.file_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Preview unavailable
          </div>
        )}
      </div>
      <div className="space-y-2 p-2">
        {canEdit ? (
          <Input
            value={caption}
            placeholder="Add a caption"
            className="text-xs"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={saveCaption}
            disabled={saving}
          />
        ) : caption ? (
          <p className="text-xs text-slate-700">{caption}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-slate-400" title={item.file_name}>
            {formatBytes(item.size_bytes)}
          </span>
          {canEdit ? (
            <button
              type="button"
              onClick={remove}
              className="text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function DocumentList({
  items,
  canEdit,
}: {
  items: GalleryItem[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No documents yet.</p>
  }

  async function remove(item: GalleryItem) {
    if (!confirm(`Delete ${item.file_name}? This cannot be undone.`)) return
    await deleteAttachmentAction(item.id)
    startTransition(() => router.refresh())
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-900">{item.file_name}</p>
            <p className="text-xs text-slate-400">{formatBytes(item.size_bytes)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-brand-600 hover:underline"
              >
                Open
              </a>
            ) : null}
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => void remove(item)}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}
