'use client'

import { useState } from 'react'
import { FileText, Film } from 'lucide-react'
import type { Topic } from '@/lib/types'
import { DocumentLessonForm } from '../../../documents/_components/document-lesson-form'
import { VideoLessonForm } from './video-lesson-form'

// Tabbed lesson composer: add a document (PDF/image/Excel) or a video (Bunny
// upload) to this topic. Both create content_items in the same topic.
export function AddLesson({
  teacherId,
  uid,
  topic,
}: {
  teacherId: string
  uid: string
  topic: Topic
}) {
  const [tab, setTab] = useState<'document' | 'video'>('document')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('document')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'document'
              ? 'bg-inverse text-inverse-fg'
              : 'border border-line text-fg-secondary hover:bg-muted'
          }`}
        >
          <FileText className="h-4 w-4" />
          Document
        </button>
        <button
          type="button"
          onClick={() => setTab('video')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'video'
              ? 'bg-inverse text-inverse-fg'
              : 'border border-line text-fg-secondary hover:bg-muted'
          }`}
        >
          <Film className="h-4 w-4" />
          Video
        </button>
      </div>

      {tab === 'document' ? (
        <DocumentLessonForm topics={[topic]} teacherId={teacherId} uid={uid} />
      ) : (
        <VideoLessonForm teacherId={teacherId} topicId={topic.id} />
      )}
    </div>
  )
}
