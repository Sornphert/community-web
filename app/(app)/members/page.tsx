import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Avatar } from '@/app/(app)/_components/avatar'
import { createClient } from '@/lib/supabase/server'
import { getAllMembers } from '@/lib/posts'

export default async function MembersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) redirect('/community')

  const members = await getAllMembers()

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Members</h1>

      {members.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No members yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-hover-subtle"
            >
              <Avatar
                url={member.avatar_url}
                name={member.display_name}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg">
                    {member.display_name}
                  </span>
                  {member.is_admin && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg-soft">
                      Admin
                    </span>
                  )}
                </div>
                {member.bio && (
                  <p className="truncate text-sm text-fg-muted">{member.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
