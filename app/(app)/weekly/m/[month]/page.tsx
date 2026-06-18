import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getWeeksForMonth } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { WeekFolderCard } from '../../_components/week-folder-card'
import { AddFolderControl } from '../../_components/add-folder-control'
import { addWeek } from '../../actions'

export default async function MonthPage({
  params,
}: {
  params: Promise<{ month: string }>
}) {
  if (!SHOW_WEEKLY) {
    notFound()
  }

  const { month: groupId } = await params
  const result = await getWeeksForMonth(groupId)
  if (!result) {
    notFound()
  }
  const { group, weeks } = result

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user?.id ?? '')
    .maybeSingle()
  const isAdmin = profile?.is_admin === true

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/weekly"
        className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Johnson Weekly 市场报告
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold text-fg">{group.name}</h1>
        {isAdmin && (
          <AddFolderControl
            label="Add Week"
            placeholder="Week name"
            onCreate={addWeek.bind(null, groupId)}
          />
        )}
      </div>

      {weeks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No weeks yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {weeks.map((week) => (
            <WeekFolderCard key={week.id} week={week} />
          ))}
        </div>
      )}
    </div>
  )
}
