'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Avatar } from '@/app/(app)/_components/avatar'

type DirectoryMember = {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  role: string
}

// The members directory with a client-side search box (name + bio). The roster is
// fetched server-side and passed in; filtering is instant and local.
export function MembersDirectory({
  slug,
  members,
}: {
  slug: string
  members: DirectoryMember[]
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = q
    ? members.filter(
        (m) =>
          m.display_name.toLowerCase().includes(q) ||
          (m.bio ?? '').toLowerCase().includes(q),
      )
    : members

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-md border border-line-strong px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-fg-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          className="flex-1 bg-transparent text-sm text-fg outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-fg-muted">No members found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((member) => (
            <Link
              key={member.id}
              href={`/t/${slug}/members/${member.id}`}
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
                  {member.role === 'admin' && (
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
