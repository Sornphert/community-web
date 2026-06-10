import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTopics } from '@/lib/classroom'
import { TopicCoverRow } from './_components/topic-cover-row'

export default async function AdminTopicCoversPage() {
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

  const topics = await getTopics()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-zinc-900">Topic Covers</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Set or change the cover image shown on each classroom topic card.
      </p>

      {topics.length === 0 ? (
        <p className="text-sm text-zinc-500">No topics yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {topics.map((topic) => (
            <li key={topic.id}>
              <TopicCoverRow topic={topic} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
