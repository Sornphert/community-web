import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildFolderTree, getFolders, getRecordings } from '@/lib/recordings'
import { AdminRecordingsTree } from './_components/admin-recordings-tree'

export default async function AdminRecordingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  const [folders, recordings] = await Promise.all([
    getFolders(),
    getRecordings(),
  ])
  const tree = buildFolderTree(folders, recordings)

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900">
        Manage Recordings
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Create folders and recordings for the Classroom. Video upload arrives in
        Stage 2.
      </p>

      <AdminRecordingsTree tree={tree} />
    </div>
  )
}
