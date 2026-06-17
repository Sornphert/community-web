import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import {
  buildFolderTree,
  getFolders,
  getRecordings,
  getUserRecordingProgress,
} from '@/lib/recordings'
import { RecordingsTree } from './_components/recordings-tree'

export default async function RecordingsPage() {
  const [folders, recordings, completedIds] = await Promise.all([
    getFolders(),
    getRecordings(),
    getUserRecordingProgress(),
  ])
  const tree = buildFolderTree(folders, recordings)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link
        href="/classroom"
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Classroom
      </Link>

      <h1 className="mt-4 mb-6 text-xl font-semibold text-fg">
        Recordings
      </h1>

      {tree.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">Recordings will appear here soon</p>
        </div>
      ) : (
        <RecordingsTree tree={tree} completedIds={completedIds} />
      )}
    </div>
  )
}
