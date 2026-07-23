import { createClient } from '@/lib/supabase/server'
import type { FollowUser, FollowState, FollowingFeedPost } from '@/lib/types'

// Platform-wide follow graph (migration 0024). Reads run on the server client;
// writes (follow/unfollow) take a browser client from a client handler, mirroring
// the like/unlike pattern. Every read joins profiles and drops tombstoned users
// (deleted_at is not null) so counts and lists never surface "[Deleted user]".

// Row shape for the profile embed on a follows read.
type FollowRow = {
  created_at: string
  profile: {
    id: string
    display_name: string
    avatar_url: string | null
    deleted_at: string | null
  } | null
}

function mapRows(rows: FollowRow[]): FollowUser[] {
  return rows
    .filter(
      (r): r is FollowRow & { profile: NonNullable<FollowRow['profile']> } =>
        r.profile !== null && r.profile.deleted_at === null,
    )
    .map((r) => ({
      user_id: r.profile.id,
      display_name: r.profile.display_name,
      avatar_url: r.profile.avatar_url,
      created_at: r.created_at,
    }))
}

// The people who follow `profileId` (newest first), tombstoned users excluded.
export async function getFollowers(profileId: string): Promise<FollowUser[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('follows')
    .select(
      'created_at, profile:profiles!follower_id(id, display_name, avatar_url, deleted_at)',
    )
    .eq('following_id', profileId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load followers: ${error.message}`)
  return mapRows((data ?? []) as unknown as FollowRow[])
}

// The people `profileId` follows (newest first), tombstoned users excluded.
export async function getFollowing(profileId: string): Promise<FollowUser[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('follows')
    .select(
      'created_at, profile:profiles!following_id(id, display_name, avatar_url, deleted_at)',
    )
    .eq('follower_id', profileId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load following: ${error.message}`)
  return mapRows((data ?? []) as unknown as FollowRow[])
}

// Counts + whether the CURRENT user follows `profileId`, plus the full lists so the
// profile can hydrate the followers/following modal with no extra round trip (small
// communities — cheap). Counts are derived from the tombstone-filtered lists, so a
// count always equals its list length. `viewerId` is the signed-in user (null when
// anon, though the follow UI is behind auth); isFollowing is false for self or anon.
export type FollowStateWithLists = FollowState & {
  followersList: FollowUser[]
  followingList: FollowUser[]
}

export async function getFollowState(
  profileId: string,
  viewerId: string | null,
): Promise<FollowStateWithLists> {
  const [followersList, followingList] = await Promise.all([
    getFollowers(profileId),
    getFollowing(profileId),
  ])

  const isFollowing =
    !!viewerId &&
    viewerId !== profileId &&
    followersList.some((f) => f.user_id === viewerId)

  return {
    followers: followersList.length,
    following: followingList.length,
    isFollowing,
    followersList,
    followingList,
  }
}

// The cross-teacher "Following" feed: recent posts by people the CURRENT user
// follows. Post visibility is NOT widened — the posts RLS still limits results to
// communities the viewer is a member of, so this is "posts by people I follow, in
// communities I'm in", newest first. Returns [] when the user follows no one.
export async function getFollowingFeed(
  limit = 50,
): Promise<FollowingFeedPost[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const following = await getFollowing(user.id)
  const ids = following.map((f) => f.user_id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, body, created_at, author_id, ' +
        'teacher:teachers!teacher_id(slug, name), ' +
        'channel:channels(slug), ' +
        'author:profiles!author_id(display_name, avatar_url)',
    )
    .in('author_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to load following feed: ${error.message}`)

  type Row = {
    id: string
    title: string | null
    body: string
    created_at: string
    author_id: string
    teacher: { slug: string; name: string } | null
    channel: { slug: string } | null
    author: { display_name: string; avatar_url: string | null } | null
  }

  return ((data ?? []) as unknown as Row[])
    // A row missing its teacher/author embed is unrenderable — skip defensively.
    .filter((r) => r.teacher !== null && r.author !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      author_id: r.author_id,
      display_name: r.author!.display_name,
      avatar_url: r.author!.avatar_url,
      teacher_slug: r.teacher!.slug,
      teacher_name: r.teacher!.name,
      channel_slug: r.channel?.slug ?? null,
    }))
}

// Writes (follow/unfollow) run inline in the client component with the browser
// client — see members/[id]/_components/follow-controls.tsx — to keep this
// server-only module (it imports the server client) out of the client bundle.
