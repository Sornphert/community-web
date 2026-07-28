import { createClient } from '@/lib/supabase/server'
import type { ContentItem, LessonFolder } from '@/lib/types'

// Nested lesson folders within a topic (0039). RLS scopes both folders and content
// items to topics the caller can access, so these fetchers just add the topic filter.

export async function getLessonFolders(
  topicId: string,
  teacherId: string,
): Promise<LessonFolder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_folders')
    .select('*')
    .eq('topic_id', topicId)
    .eq('teacher_id', teacherId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load folders: ${error.message}`)
  return (data ?? []) as LessonFolder[]
}

// A folder node: the folder, its child folders, and the lessons directly in it.
export type LessonTreeNode = {
  folder: LessonFolder
  children: LessonTreeNode[]
  lessons: ContentItem[]
}

// The full tree for a topic: lessons + folders at the root, then nested folders.
export type LessonTree = {
  rootLessons: ContentItem[]
  folders: LessonTreeNode[]
}

// Assemble folders + content items into a nested tree. Orphaned folder_ids (folder
// deleted mid-flight) fall back to the root.
export function buildLessonTree(
  folders: LessonFolder[],
  items: ContentItem[],
): LessonTree {
  const nodeById = new Map<string, LessonTreeNode>()
  for (const folder of folders) {
    nodeById.set(folder.id, { folder, children: [], lessons: [] })
  }

  const rootFolders: LessonTreeNode[] = []
  for (const folder of folders) {
    const node = nodeById.get(folder.id)!
    const parent = folder.parent_folder_id
      ? nodeById.get(folder.parent_folder_id)
      : null
    if (parent) parent.children.push(node)
    else rootFolders.push(node)
  }

  const rootLessons: ContentItem[] = []
  for (const item of items) {
    const node = item.folder_id ? nodeById.get(item.folder_id) : null
    if (node) node.lessons.push(item)
    else rootLessons.push(item)
  }

  return { rootLessons, folders: rootFolders }
}
