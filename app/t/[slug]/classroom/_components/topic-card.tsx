import { Lock } from 'lucide-react'
import type { Topic } from '@/lib/types'

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface transition-shadow hover:shadow-md">
      {topic.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={topic.cover_image_url}
          alt={topic.name}
          className="aspect-[4/3] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center bg-muted">
          <span className="px-2 text-center text-sm font-medium text-fg-muted">
            {topic.name}
          </span>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-center gap-2">
          <p className="line-clamp-2 min-w-0 flex-1 font-medium text-fg">
            {topic.name}
          </p>
          {topic.is_locked && (
            <Lock className="h-4 w-4 shrink-0 text-fg-faint" />
          )}
        </div>
      </div>
    </div>
  )
}
