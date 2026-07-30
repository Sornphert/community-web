import { createClient } from '@/lib/supabase/server'
import type {
  ContentReport,
  ContentReportWithContext,
  ReportStatus,
} from '@/lib/types'

// Moderation fetchers (migration 0041). All reads are RLS-gated: content_reports_select
// exposes a teacher's whole queue only to that teacher's admins (and a reporter's own
// rows). Callers still pass teacherId so the query is explicitly scoped.

// Count of OPEN reports — drives the admin dashboard / sidebar badge. Cheap head count.
export async function getOpenReportCount(teacherId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('content_reports')
    .select('id', { count: 'exact', head: true })
    .eq('teacher_id', teacherId)
    .eq('status', 'open')
  if (error) {
    throw new Error(`getOpenReportCount failed: ${error.message}`)
  }
  return count ?? 0
}

const PREVIEW_LEN = 140

function truncate(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim()
  if (!t) return null
  return t.length > PREVIEW_LEN ? `${t.slice(0, PREVIEW_LEN)}…` : t
}

// The admin review queue for one teacher. Fetches the report rows, then batch-resolves a
// text preview + deep link for each target (posts/comments/users) with follow-up queries —
// target_id is polymorphic and has no FK to embed. A target that no longer exists (deleted
// after the report) is flagged targetMissing so the admin still sees the row.
export async function getReports(
  teacherId: string,
  teacherSlug: string,
  status: ReportStatus = 'open',
): Promise<ContentReportWithContext[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('content_reports')
    .select(
      '*, reporter:profiles!reporter_id(id, display_name, avatar_url)',
    )
    .eq('teacher_id', teacherId)
    .eq('status', status)
    .order('created_at', { ascending: false })
  if (error) {
    throw new Error(`getReports failed: ${error.message}`)
  }

  type Row = ContentReport & {
    reporter: { id: string; display_name: string; avatar_url: string | null }
  }
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  const postIds = rows.filter((r) => r.target_type === 'post').map((r) => r.target_id)
  const commentIds = rows.filter((r) => r.target_type === 'comment').map((r) => r.target_id)
  const userIds = rows.filter((r) => r.target_type === 'user').map((r) => r.target_id)

  // Batch-load each kind of target. Channel slug rides along so we can build the deep link.
  const [postsRes, commentsRes, usersRes] = await Promise.all([
    postIds.length
      ? supabase
          .from('posts')
          .select('id, title, body, channel:channels(slug)')
          .in('id', postIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    commentIds.length
      ? supabase
          .from('comments')
          .select('id, body, post_id, post:posts!post_id(id, channel:channels(slug))')
          .in('id', commentIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    userIds.length
      ? supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])

  type PostRow = { id: string; title: string | null; body: string | null; channel: { slug: string } | null }
  type CommentRow = { id: string; body: string | null; post_id: string; post: { id: string; channel: { slug: string } | null } | null }
  type UserRow = { id: string; display_name: string }

  const posts = new Map((((postsRes.data ?? []) as PostRow[])).map((p) => [p.id, p]))
  const comments = new Map((((commentsRes.data ?? []) as CommentRow[])).map((c) => [c.id, c]))
  const users = new Map((((usersRes.data ?? []) as UserRow[])).map((u) => [u.id, u]))

  return rows.map((r) => {
    let targetPreview: string | null = null
    let targetHref: string | null = null
    let targetMissing = false

    if (r.target_type === 'post') {
      const p = posts.get(r.target_id)
      if (!p) targetMissing = true
      else {
        targetPreview = truncate(p.title) ?? truncate(p.body)
        if (p.channel?.slug) {
          targetHref = `/t/${teacherSlug}/community/${p.channel.slug}/${p.id}`
        }
      }
    } else if (r.target_type === 'comment') {
      const c = comments.get(r.target_id)
      if (!c) targetMissing = true
      else {
        targetPreview = truncate(c.body)
        if (c.post?.channel?.slug) {
          targetHref = `/t/${teacherSlug}/community/${c.post.channel.slug}/${c.post.id}#comment-${c.id}`
        }
      }
    } else {
      const u = users.get(r.target_id)
      if (!u) targetMissing = true
      else {
        targetPreview = u.display_name
        targetHref = `/t/${teacherSlug}/members/${u.id}`
      }
    }

    return {
      ...r,
      targetPreview,
      targetHref,
      targetMissing,
    } as ContentReportWithContext
  })
}
