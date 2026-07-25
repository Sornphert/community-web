import { NextResponse, type NextRequest } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import type { NotificationType } from '@/lib/types'

// web-push uses node crypto and the service-role key — must be the Node runtime.
export const runtime = 'nodejs'

// A Supabase Database Webhook (Database → Webhooks) POSTs here on every INSERT
// into public.notifications. It self-authenticates via a ?secret= query param
// (mirrors the Bunny webhook; this route is excluded from the proxy matcher).
// We look up the recipient's push subscriptions and deliver an OS-level push,
// pruning any subscription the push service reports as gone.

type NotificationRecord = {
  id: string
  teacher_id: string
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  post_id: string | null
  comment_id: string | null
  event_id: string | null
}

type WebhookBody = {
  type?: string
  table?: string
  record?: NotificationRecord
}

function verbFor(type: NotificationType): string {
  switch (type) {
    case 'mention':
      return 'mentioned you'
    case 'mention_all':
      return 'mentioned everyone'
    case 'post_comment':
      return 'commented on your post'
    case 'post_like':
      return 'liked your post'
    case 'comment_like':
      return 'liked your comment'
    default:
      return 'sent you a notification'
  }
}

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@theprophetsystem.com'
  if (!publicKey || !privateKey) {
    // Misconfigured — ack so the webhook doesn't retry forever.
    return NextResponse.json({ ok: true, skipped: 'no_vapid' })
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  let record: NotificationRecord | undefined
  try {
    const body = (await request.json()) as WebhookBody
    if (body.type !== 'INSERT' || !body.record) {
      return NextResponse.json({ ok: true, skipped: 'not_insert' })
    }
    record = body.record
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  if (!record.recipient_id) {
    return NextResponse.json({ ok: true, skipped: 'no_recipient' })
  }

  const supabase = createServiceClient()

  // Recipient's subscriptions first — nothing to do if they have none.
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', record.recipient_id)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_subscriptions' })
  }

  // Enrich for the notification copy + deep link.
  const [{ data: actor }, { data: post }, { data: teacher }] =
    await Promise.all([
      record.actor_id
        ? supabase
            .from('profiles')
            .select('display_name')
            .eq('id', record.actor_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      record.post_id
        ? supabase
            .from('posts')
            .select('title, channel:channels(slug)')
            .eq('id', record.post_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('teachers')
        .select('slug, name')
        .eq('id', record.teacher_id)
        .maybeSingle(),
    ])

  const actorName =
    (actor as { display_name?: string } | null)?.display_name ?? 'Someone'
  const postRow = post as {
    title: string | null
    channel: { slug: string } | null
  } | null
  const teacherRow = teacher as { slug: string; name: string } | null

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    request.nextUrl.origin

  let title = `${actorName} ${verbFor(record.type)}`
  let bodyText = postRow?.title ?? teacherRow?.name ?? ''
  let url = origin

  if (record.type === 'event_reminder') {
    // Event reminders name the event and deep-link to the teacher's Events page.
    const { data: event } = record.event_id
      ? await supabase
          .from('events')
          .select('title, starts_at')
          .eq('id', record.event_id)
          .maybeSingle()
      : { data: null }
    const ev = event as { title?: string; starts_at?: string } | null
    title = `Reminder: ${ev?.title ?? 'An event'}`
    const ms = ev?.starts_at
      ? new Date(ev.starts_at).getTime() - Date.now()
      : 0
    const hours = Math.round(ms / 3_600_000)
    bodyText =
      hours >= 20
        ? 'Starts in about a day'
        : hours >= 2
          ? `Starts in about ${hours} hours`
          : 'Starting within the hour'
    url = teacherRow ? `${origin}/t/${teacherRow.slug}/events` : origin
  } else if (teacherRow) {
    url = `${origin}/t/${teacherRow.slug}/community`
    if (record.post_id && postRow?.channel?.slug) {
      url += `/${postRow.channel.slug}/${record.post_id}`
    }
  }

  const payload = JSON.stringify({
    title,
    body: bodyText,
    url,
    tag: record.id,
  })

  // Deliver to every subscription; prune ones the push service says are gone.
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        payload,
      ),
    ),
  )

  const deadEndpoints: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const status = (r.reason as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        deadEndpoints.push(subs[i].endpoint)
      } else {
        console.error('push send failed:', r.reason)
      }
    }
  })

  if (deadEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', deadEndpoints)
  }

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.status === 'fulfilled').length,
    pruned: deadEndpoints.length,
  })
}
