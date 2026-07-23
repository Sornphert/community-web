'use client'

import { useState } from 'react'
import { CommunityInfoModal } from '@/app/_components/community-info-modal'
import { TeacherCard } from './teacher-card'

// [Locked community] A non-member's view of a community they can't enter (the
// 'invite_only' and 'discover_public' card states). Clicking opens an info MODAL —
// no navigation, works for logged-out visitors and logged-in non-members alike, all
// on the public /home page. The modal shows the teacher's description and, when set,
// a "Visit website" button to enroll on the teacher's own site. This is deliberately
// SEPARATE from the in-app request-to-join flow (/t/[slug]/join).
type LockedTeacher = {
  slug: string
  name: string
  cover_url: string | null
  logo_url: string | null
  description: string | null
  website_url: string | null
}

export function LockedCommunityCard({
  teacher,
  memberCount,
  state,
}: {
  teacher: LockedTeacher
  memberCount: number
  state: 'invite_only' | 'discover_public'
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="block w-full rounded-lg text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TeacherCard teacher={teacher} memberCount={memberCount} state={state} />
      </button>

      {open && <CommunityInfoModal teacher={teacher} onClose={() => setOpen(false)} />}
    </>
  )
}
