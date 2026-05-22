import { Lock } from 'lucide-react'
import type { Topic } from '@/lib/types'

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition-shadow hover:shadow-md">
      {topic.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={topic.cover_image_url}
          alt={topic.name}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100">
          <span className="px-2 text-center text-sm font-medium text-zinc-500">
            {topic.name}
          </span>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <p className="line-clamp-2 min-w-0 flex-1 font-medium text-zinc-900">
            {topic.name}
          </p>
          {topic.is_locked && (
            <Lock className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
        </div>
      </div>
    </div>
  )
}
