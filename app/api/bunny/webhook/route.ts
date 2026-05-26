import { NextResponse, type NextRequest } from 'next/server'
import * as bunny from '@/lib/bunny'
import { createServiceClient } from '@/lib/supabase/service'

// Uses node crypto / service-role key, so it must run on the Node.js runtime.
export const runtime = 'nodejs'

// Bunny Stream POSTs here when a video's status changes. Bunny has no custom
// webhook-secret field, so we authenticate via a ?secret= query param on the
// registered webhook URL. The webhook body's Status int is ambiguous across
// Bunny's docs, so we ignore it for mapping and re-read the authoritative
// status from getVideo() — the same logic as the admin "Refresh status" action.
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.BUNNY_STREAM_WEBHOOK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  let videoGuid: string | undefined
  try {
    const body = (await request.json()) as { VideoGuid?: string }
    videoGuid = body.VideoGuid
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }
  if (!videoGuid) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: recording } = await supabase
    .from('classroom_recordings')
    .select('id')
    .eq('video_id', videoGuid)
    .maybeSingle()

  // Unknown video (e.g. deleted, or from another app) — ack so Bunny stops retrying.
  if (!recording) {
    return NextResponse.json({ ok: true })
  }

  let info: Awaited<ReturnType<typeof bunny.getVideo>>
  try {
    info = await bunny.getVideo(videoGuid)
  } catch (e) {
    console.error(`Bunny webhook: getVideo(${videoGuid}) failed.`, e)
    // 500 so Bunny retries later.
    return new NextResponse('Upstream error', { status: 500 })
  }

  const next = bunny.mapBunnyStatusToVideoStatus(info.status)
  if (!next) {
    return NextResponse.json({ ok: true }) // status we don't act on
  }

  const update: Record<string, unknown> = { video_status: next }
  if (next === 'ready') {
    update.video_duration_seconds = info.length
    update.video_thumbnail_url = bunny.getThumbnailUrl(videoGuid)
  }

  const { error } = await supabase
    .from('classroom_recordings')
    .update(update)
    .eq('id', recording.id)

  if (error) {
    console.error(`Bunny webhook: failed to update recording ${recording.id}.`, error)
    return new NextResponse('Update failed', { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
