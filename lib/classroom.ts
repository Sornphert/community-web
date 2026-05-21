import { createClient } from '@/lib/supabase/server'
import type { ContentItem, Topic } from '@/lib/types'

export async function getTopics(): Promise<Topic[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load topics: ${error.message}`)
  }

  return (data ?? []) as Topic[]
}

export async function getTopic(id: string): Promise<Topic | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load topic: ${error.message}`)
  }

  return (data ?? null) as Topic | null
}

export async function getContentItems(topicId: string): Promise<ContentItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('topic_id', topicId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load content items: ${error.message}`)
  }

  return (data ?? []) as ContentItem[]
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load content item: ${error.message}`)
  }

  return (data ?? null) as ContentItem | null
}

export async function getUserProgress(
  userId: string,
  contentItemIds: string[],
): Promise<Set<string>> {
  if (contentItemIds.length === 0) {
    return new Set<string>()
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_progress')
    .select('content_item_id')
    .eq('user_id', userId)
    .in('content_item_id', contentItemIds)

  if (error) {
    throw new Error(`Failed to load progress: ${error.message}`)
  }

  const rows = (data ?? []) as { content_item_id: string }[]
  return new Set(rows.map((row) => row.content_item_id))
}

export async function isContentCompleted(
  userId: string,
  contentItemId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_progress')
    .select('content_item_id')
    .eq('user_id', userId)
    .eq('content_item_id', contentItemId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load completion state: ${error.message}`)
  }

  return !!data
}
