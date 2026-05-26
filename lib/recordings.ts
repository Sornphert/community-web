import { createClient } from '@/lib/supabase/server'
import type { ClassroomFolder, ClassroomRecording } from '@/lib/types'

// A folder plus its direct recordings and child folders, ready to render as a tree.
export type RecordingTreeNode = {
  folder: ClassroomFolder
  recordings: ClassroomRecording[]
  children: RecordingTreeNode[]
}

// NOTE: this module imports the server Supabase client, so it must only be
// imported from Server Components. Client tree components receive the already
// built tree (RecordingTreeNode[]) as props; they must not import this file.

export async function getFolders(): Promise<ClassroomFolder[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_folders')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load folders: ${error.message}`)
  }

  return (data ?? []) as ClassroomFolder[]
}

export async function getRecordings(): Promise<ClassroomRecording[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_recordings')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load recordings: ${error.message}`)
  }

  return (data ?? []) as ClassroomRecording[]
}

export async function getRecording(
  id: string,
): Promise<ClassroomRecording | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_recordings')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load recording: ${error.message}`)
  }

  return (data ?? null) as ClassroomRecording | null
}

// Pure helper (no server imports): builds the nested tree from flat rows.
// Recordings whose folder_id is null (orphans) are omitted — the UI always
// assigns a folder. Folders and recordings are assumed pre-sorted by position.
export function buildFolderTree(
  folders: ClassroomFolder[],
  recordings: ClassroomRecording[],
): RecordingTreeNode[] {
  const nodes = new Map<string, RecordingTreeNode>()
  for (const folder of folders) {
    nodes.set(folder.id, { folder, recordings: [], children: [] })
  }

  for (const recording of recordings) {
    if (!recording.folder_id) continue
    nodes.get(recording.folder_id)?.recordings.push(recording)
  }

  const roots: RecordingTreeNode[] = []
  for (const folder of folders) {
    const node = nodes.get(folder.id)!
    if (folder.parent_folder_id && nodes.has(folder.parent_folder_id)) {
      nodes.get(folder.parent_folder_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// Pure helper: the chain of folders from the root down to (and including)
// folderId, in root-first order. Used for breadcrumbs and hash pre-expansion.
export function getFolderAncestors(
  folders: ClassroomFolder[],
  folderId: string | null,
): ClassroomFolder[] {
  if (!folderId) return []

  const byId = new Map(folders.map((f) => [f.id, f]))
  const chain: ClassroomFolder[] = []
  let current = byId.get(folderId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parent_folder_id
      ? byId.get(current.parent_folder_id)
      : undefined
  }

  return chain
}
