import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getChannelsLegacyUnscoped, getUnassignedPosts } from '@/lib/posts'
import { MigrateList } from './_components/migrate-list'

export default async function MigratePostsPage() {
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

  const [posts, channels] = await Promise.all([
    getUnassignedPosts(),
    getChannelsLegacyUnscoped(),
  ])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-fg">
        Assign Channels
      </h1>
      <p className="mb-6 text-sm text-fg-muted">
        {posts.length} post{posts.length === 1 ? '' : 's'} without a channel.
        Assign each one, then run migration 0003 to require the column.
      </p>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-6 text-center text-fg-muted">
          All posts have a channel. You can now run{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            0003_posts_channel_required.sql
          </code>
          .
        </div>
      ) : (
        <MigrateList posts={posts} channels={channels} />
      )}
    </div>
  )
}
