'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ActionResult = { error?: string }

// Assign a channel to a (possibly other member's) post. The DB-level enabler is
// the `posts_update_admin` RLS policy from migration 0002; this admin check is the
// belt-and-suspenders guard so a non-admin never reaches the update.
export async function assignPostChannel(input: {
  postId: string
  channelId: string
}): Promise<ActionResult> {
  if (!input.postId || !input.channelId) {
    return { error: 'Post and channel are required.' }
  }

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

  const { error } = await supabase
    .from('posts')
    .update({ channel_id: input.channelId })
    .eq('id', input.postId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/migrate-posts')
  return {}
}
