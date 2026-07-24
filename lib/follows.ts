import { createClient } from '@/lib/supabase/server'
import type {
  FollowUser,
  FollowState,
  FollowingFeedPost,
  SocialLinks,
  UserCard,
} from '@/lib/types'

// Platform-wide follow graph (migrations 0024 + 0025). Reads run on the server
// client. To make follows GLOBAL (not locked to shared communities), identity reads
// go through SECURITY DEFINER RPCs (get_followers / get_following / user_card) that
// bypass the co-member-only profiles RLS and already drop tombstoned users. Writes
// (follow/unfollow) run inline in the client component with the browser client.

// The people who follow `profileId` (newest first), tombstoned users excluded.
export async function getFollowers(profileId: string): Promise<FollowUser[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_followers', {
    p_profile: profileId,
  })
  if (error) throw new Error(`Failed to load followers: ${error.message}`)
  return (data ?? []) as FollowUser[]
}

// The people `profileId` follows (newest first), tombstoned users excluded.
export async function getFollowing(profileId: string): Promise<FollowUser[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_following', {
    p_profile: profileId,
  })
  if (error) throw new Error(`Failed to load following: ${error.message}`)
  return (data ?? []) as FollowUser[]
}

// Minimal GLOBAL identity for any live user — name, avatar, bio, socials — readable
// cross-tenant (0025 user_card RPC). Returns null for an unknown/tombstoned user.
export async function getUserCard(userId: string): Promise<UserCard | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('user_card', { p_user: userId })
  if (error) throw new Error(`Failed to load user: ${error.message}`)
  const row = (data ?? [])[0] as
    | {
        id: string
        display_name: string
        avatar_url: string | null
        bio: string | null
        social_links: SocialLinks | null
      }
    | undefined
  if (!row) return null
  return {
    id: row.id,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    social_links: (row.social_links ?? {}) as SocialLinks,
  }
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
