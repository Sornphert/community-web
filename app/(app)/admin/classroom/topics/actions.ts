'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { TOPIC_COVERS_BUCKET } from '@/lib/topic-covers'
import type { Topic } from '@/lib/types'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Belt-and-suspenders admin guard (the topics RLS is the real enabler). Mirrors
// the helper in admin/classroom/documents/actions.ts — kept file-local there, so
// duplicated here rather than shared.
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

export async function updateTopicCover(input: {
  topicId: string
  coverImageUrl: string
  coverStoragePath: string
}): Promise<{ error?: string; topic?: Topic }> {
  if (!input.topicId) {
    return { error: 'Missing topic.' }
  }
  if (!input.coverImageUrl || !input.coverStoragePath) {
    return { error: 'The cover upload is missing.' }
  }

  const auth = await requireAdmin()
  if ('error' in auth) return auth

  // Grab the existing cover path first so we can clean it up after the swap.
  const { data: existing } = await auth.supabase
    .from('topics')
    .select('cover_storage_path')
    .eq('id', input.topicId)
    .maybeSingle()

  const { data, error } = await auth.supabase
    .from('topics')
    .update({
      cover_image_url: input.coverImageUrl,
      cover_storage_path: input.coverStoragePath,
    })
    .eq('id', input.topicId)
    .select('*')
    .single()

  if (error) {
    return { error: error.message }
  }

  // Best-effort: delete the previous cover object so replacing covers doesn't
  // orphan files (account deletion cleanup never touches topic-covers). A failure
  // here only leaves an orphan — the row is already updated, so we ignore it.
  const oldPath = existing?.cover_storage_path
  if (oldPath && oldPath !== input.coverStoragePath) {
    await auth.supabase.storage.from(TOPIC_COVERS_BUCKET).remove([oldPath])
  }

  revalidatePath('/classroom')
  revalidatePath('/admin/classroom/topics')
  return { topic: data as Topic }
}
