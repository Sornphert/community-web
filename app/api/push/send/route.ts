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
  recipient_id: string
  actor_id: string | null
  type: NotificationType
  post_id: string | null
  comment_id: string | null
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

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', record.recipient_id)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_subscriptions' })
  }

  const [{ data: actor }, { data: post }] = await Promise.all([
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
  ])

  const actorName =
    (actor as { display_name?: string } | null)?.display_name ?? 'Someone'
  const postRow = post as {
    title: string | null
    channel: { slug: string } | null
  } | null

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    request.nextUrl.origin

  let url = `${origin}/community`
  if (record.post_id && postRow?.channel?.slug) {
    url = `${origin}/community/${postRow.channel.slug}/${record.post_id}`
  }

  // Per-site notification icon. Each deployment sets its own brand logo via
  // NEXT_PUBLIC_BRAND_LOGO_URL; without this the service worker falls back to
  // the shared /brand.jpg committed in the repo (one teacher's logo shown on
  // every site). Resolve relative paths against this site's origin so the push
  // service can fetch it.
  const brand = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '/brand.jpg'
  const iconUrl = /^https?:\/\//.test(brand) ? brand : `${origin}${brand}`

  const payload = JSON.stringify({
    title: `${actorName} ${verbFor(record.type)}`,
    body: postRow?.title ?? '',
    url,
    icon: iconUrl,
    badge: iconUrl,
    tag: record.id,
  })

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
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
