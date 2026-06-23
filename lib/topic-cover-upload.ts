// Browser-only helper: convert a picked image to JPEG and upload it to the
// `topic-covers` bucket, returning the public URL + storage path to persist on
// the topic row. Shared by the new-topic flow (document form) and the admin
// covers page. Mirrors the convertToJpg → upload → getPublicUrl flow in
// document-lesson-form.tsx, but targets topic-covers.
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { formatFileSize } from '@/lib/format'
import { MAX_TOPIC_COVER_SIZE_BYTES, TOPIC_COVERS_BUCKET } from '@/lib/topic-covers'

export async function uploadTopicCover(
  file: File,
  teacherId: string,
  uid: string,
): Promise<{ url: string; path: string }> {
  const supabase = createClient()

  // Always JPEG (app-wide convention). The converted blob is the real payload —
  // check it against the bucket limit rather than the raw file, which compresses.
  const body = await convertToJpg(file)
  if (body.size > MAX_TOPIC_COVER_SIZE_BYTES) {
    throw new Error(
      `Image is too large after processing. Max ${formatFileSize(MAX_TOPIC_COVER_SIZE_BYTES)}.`,
    )
  }

  // [MT] topic-covers RLS checks ONLY segment [1] of the path
  // (is_teacher_admin(((storage.foldername(name))[1])::uuid)). Segment [1] MUST be
  // teacherId — it is load-bearing for the write check. The {uid} segment is
  // COSMETIC (kept for parity with the Community storage path helper); do NOT build
  // a per-uid boundary on it — this bucket has no [2]=auth.uid() check.
  const path = `${teacherId}/${uid}/covers/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage
    .from(TOPIC_COVERS_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg' })
  if (error) {
    throw error
  }

  const url = supabase.storage
    .from(TOPIC_COVERS_BUCKET)
    .getPublicUrl(path).data.publicUrl

  return { url, path }
}
