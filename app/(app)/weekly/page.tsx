import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMonths } from '@/lib/posts'
import { SHOW_WEEKLY } from '@/lib/config'
import { MonthFolderCard } from './_components/month-folder-card'
import { AddFolderControl } from './_components/add-folder-control'
import { addMonth } from './actions'

export default async function WeeklyHubPage() {
  // Env gate: the whole feature is invisible (even by direct URL) when off.
  if (!SHOW_WEEKLY) {
    notFound()
  }

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

  const months = await getMonths()

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            Johnson Weekly 市场报告
          </h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            Weekly market reports. Open a month to see its weeks.
          </p>
        </div>
        {isAdmin && (
          <AddFolderControl
            label="Add Month"
            placeholder="Month name"
            onCreate={addMonth}
          />
        )}
      </div>

      {months.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No months yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {months.map((month) => (
            <MonthFolderCard key={month.id} month={month} />
          ))}
        </div>
      )}
    </div>
  )
}
