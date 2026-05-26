import { createHash } from 'crypto'

// Server-only Bunny Stream API client. This module reads BUNNY_STREAM_API_KEY,
// so it must never be imported into a Client Component. The library ID and CDN
// hostname legitimately end up in client-facing iframe/thumbnail URLs; the API
// key, however, stays here and is never returned to the browser.

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID
const API_KEY = process.env.BUNNY_STREAM_API_KEY
const CDN_HOSTNAME = process.env.BUNNY_STREAM_CDN_HOSTNAME

function requireConfig(): { libraryId: string; apiKey: string } {
  if (!LIBRARY_ID || !API_KEY) {
    throw new Error(
      'Bunny Stream is not configured (BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY).',
    )
  }
  return { libraryId: LIBRARY_ID, apiKey: API_KEY }
}

const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

// Bunny video-object status enum (the documented, stable one):
//   0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished
//   5 Error · 6 UploadFailed · (7/8 JIT segmenting/playlists)
export type BunnyVideoInfo = {
  status: number
  length: number
  thumbnailFileName: string | null
}

type RawBunnyVideo = {
  guid?: string
  status?: number
  length?: number
  thumbnailFileName?: string | null
}

async function bunnyFetch(path: string, init?: RequestInit): Promise<Response> {
  const { libraryId, apiKey } = requireConfig()
  const res = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}${path}`,
    {
      ...init,
      headers: {
        AccessKey: apiKey,
        accept: 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Bunny API ${init?.method ?? 'GET'} ${path} failed: ${res.status} ${res.statusText} ${body}`.trim(),
    )
  }
  return res
}

export async function createVideo(title: string): Promise<{ videoId: string }> {
  const res = await bunnyFetch('/videos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const data = (await res.json()) as RawBunnyVideo
  if (!data.guid) {
    throw new Error('Bunny createVideo returned no guid.')
  }
  return { videoId: data.guid }
}

export async function getVideo(videoId: string): Promise<BunnyVideoInfo> {
  const res = await bunnyFetch(`/videos/${videoId}`)
  const data = (await res.json()) as RawBunnyVideo
  return {
    status: data.status ?? 0,
    length: data.length ?? 0,
    thumbnailFileName: data.thumbnailFileName ?? null,
  }
}

export async function deleteVideo(videoId: string): Promise<void> {
  await bunnyFetch(`/videos/${videoId}`, { method: 'DELETE' })
}

// Pure (no network): presigned TUS credentials the browser uses to upload
// directly to Bunny without ever seeing the API key. The signature is
// SHA256(libraryId + apiKey + expirationTime + videoId), and the values used
// here must match the headers the client sends byte-for-byte.
export type TusUploadCredentials = {
  tusEndpoint: string
  authorizationSignature: string
  authorizationExpire: number
  videoId: string
  libraryId: string
}

export function getTusUploadCredentials(videoId: string): TusUploadCredentials {
  const { libraryId, apiKey } = requireConfig()
  const authorizationExpire = Math.floor(Date.now() / 1000) + 3600
  const authorizationSignature = createHash('sha256')
    .update(`${libraryId}${apiKey}${authorizationExpire}${videoId}`)
    .digest('hex')

  return {
    tusEndpoint: TUS_ENDPOINT,
    authorizationSignature,
    authorizationExpire,
    videoId,
    libraryId,
  }
}

export function getPlayerUrl(videoId: string): string {
  const { libraryId } = requireConfig()
  return `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`
}

export function getThumbnailUrl(videoId: string): string {
  if (!CDN_HOSTNAME) {
    throw new Error('Bunny Stream is not configured (BUNNY_STREAM_CDN_HOSTNAME).')
  }
  return `https://${CDN_HOSTNAME}/${videoId}/thumbnail.jpg`
}

// Maps a Bunny video-object status int to our video_status. null => leave
// unchanged (status we don't act on). Single source of truth for the webhook
// and the manual "Refresh status" action.
export function mapBunnyStatusToVideoStatus(
  status: number,
): 'ready' | 'processing' | 'failed' | null {
  switch (status) {
    case 4:
      return 'ready'
    case 5:
    case 6:
      return 'failed'
    case 0:
    case 1:
    case 2:
    case 3:
      return 'processing'
    default:
      return null
  }
}
