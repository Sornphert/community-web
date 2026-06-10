'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ContentItem, Topic } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Shared admin guard. The DB-level enabler is the *_admin RLS policies on
// topics/content_items; this is the belt-and-suspenders guard so a non-admin
// never reaches the write. Returns the supabase client + user id on success.
async function requireAdmin(): Promise<
  { supabase: ServerClient; userId: string } | { error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_admin) {
    return { error: 'Admins only.' }
  }

  return { supabase, userId: user.id }
}

function revalidate(topicId?: string) {
  revalidatePath('/admin/classroom/documents')
  revalidatePath('/classroom')
  if (topicId) {
    revalidatePath(`/classroom/topic/${topicId}`)
  }
}

export async function createTopic(input: {
  name: string
  coverImageUrl?: string | null
  coverStoragePath?: string | null
}): Promise<{ error?: string; topic?: Topic }> {
  const name = input.name.trim()
  if (!name) {
    return { error: 'Topic name is required.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Only `name` is required — position/is_locked/etc. use DB defaults. The cover
  // is optional; the client uploads it to topic-covers first and passes the
  // resulting URL + path (both null when no cover was attached).
  const { data, error } = await auth.supabase
    .from('topics')
    .insert({
      name,
      cover_image_url: input.coverImageUrl ?? null,
      cover_storage_path: input.coverStoragePath ?? null,
    })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidate()
  return { topic: data as Topic }
}

export async function createDocumentLesson(input: {
  topicId: string
  title: string
  description: string
  documentUrl: string
  documentStoragePath: string
  thumbnailUrl: string | null
}): Promise<{ error?: string; item?: ContentItem }> {
  const title = input.title.trim()
  if (!title) {
    return { error: 'Title is required.' }
  }
  if (!input.topicId) {
    return { error: 'Please choose a topic.' }
  }
  if (!input.documentUrl) {
    return { error: 'The file upload is missing.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Append after existing lessons in this topic for stable ordering.
  const { count, error: countError } = await auth.supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('topic_id', input.topicId)

  if (countError) {
    return { error: countError.message }
  }

  const { data, error } = await auth.supabase
    .from('content_items')
    .insert({
      topic_id: input.topicId,
      type: 'document',
      title,
      description: input.description.trim() || null,
      document_url: input.documentUrl,
      document_storage_path: input.documentStoragePath,
      thumbnail_url: input.thumbnailUrl,
      position: count ?? 0,
    })
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidate(input.topicId)
  return { item: data as ContentItem }
}
