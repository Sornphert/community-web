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
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 hover:bg-zinc-50">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded">
        {item.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : item.type === 'video' ? (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100">
            <PlayCircle className="h-6 w-6 text-zinc-400" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-medium text-zinc-900">{item.title}</p>
        <p className="text-xs text-zinc-500">
          {item.type === 'video' ? 'Video' : 'Document'}
        </p>
      </div>

      {completed && (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
      )}
    </div>
  )
}
