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

// [MT] Every fetcher takes a REQUIRED teacherId and filters teacher_id. An un-scoped
// read does NOT error under MT RLS — it returns rows for EVERY teacher the viewer
// belongs to. These .eq filters are the only thing preventing cross-tenant bleed.

export async function getFolders(teacherId: string): Promise<ClassroomFolder[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_folders')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load folders: ${error.message}`)
  }

  return (data ?? []) as ClassroomFolder[]
}

export async function getRecordings(
  teacherId: string,
): Promise<ClassroomRecording[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_recordings')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load recordings: ${error.message}`)
  }

  return (data ?? []) as ClassroomRecording[]
}

export async function getRecording(
  id: string,
  teacherId: string,
): Promise<ClassroomRecording | null> {
  const supabase = await createClient()

  // LOAD-BEARING teacher_id filter — a dual-member passes has_membership for both
  // teachers, so RLS would permit reading another teacher's recording by id. This
  // filter is what makes /t/[A-slug]/classroom/recordings/[B-owned-id] resolve to
  // null (→ notFound) rather than playing B's recording under A's shell.
  const { data, error } = await supabase
    .from('classroom_recordings')
    .select('*')
    .eq('id', id)
    .eq('teacher_id', teacherId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load recording: ${error.message}`)
  }

  return (data ?? null) as ClassroomRecording | null
}

// The set of recording ids the current user has marked complete, SCOPED to this
// teacher. Resolves the auth user internally and returns an empty Set when signed
// out. [MT] The teacher scope is REQUIRED, not cosmetic: classroom_recording_progress
// is a leaf table with no teacher_id, so an un-scoped read serializes a dual-member's
// OTHER teachers' recording_ids into this teacher's page payload (cross-tenant id
// disclosure). The !inner join to classroom_recordings + teacher_id filter drops any
// progress row whose recording belongs to another teacher.
export async function getUserRecordingProgress(
  teacherId: string,
): Promise<Set<string>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Set<string>()
  }

  const { data, error } = await supabase
    .from('classroom_recording_progress')
    .select('recording_id, classroom_recordings!inner(teacher_id)')
    .eq('user_id', user.id)
    .eq('classroom_recordings.teacher_id', teacherId)

  if (error) {
    throw new Error(`Failed to load recording progress: ${error.message}`)
  }

  const rows = (data ?? []) as { recording_id: string }[]
  return new Set(rows.map((row) => row.recording_id))
}

// Whether the current user has marked a single recording complete.
export async function isRecordingCompleted(
  recordingId: string,
): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data, error } = await supabase
    .from('classroom_recording_progress')
    .select('recording_id')
    .eq('user_id', user.id)
    .eq('recording_id', recordingId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load completion state: ${error.message}`)
  }

  return !!data
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
