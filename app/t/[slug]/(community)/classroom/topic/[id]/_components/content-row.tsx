import { CheckCircle2, FileText, PlayCircle } from 'lucide-react'
import type { ContentItem } from '@/lib/types'

export function ContentRow({
  item,
  completed,
}: {
  item: ContentItem
  completed: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-hover-subtle">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : item.type === 'video' ? (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <PlayCircle className="h-6 w-6 text-fg-faint" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <FileText className="h-6 w-6 text-fg-faint" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-fg">{item.title}</p>
        <p className="text-xs text-fg-muted">
          {item.type === 'video' ? 'Video' : 'Document'}
        </p>
      </div>

      {completed && (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
      )}
    </div>
  )
}
