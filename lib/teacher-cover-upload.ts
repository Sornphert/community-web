// Browser-only helper: convert a picked image to JPEG and upload it to the
// `teacher-covers` bucket, returning the public URL + storage path. Mirrors
// lib/topic-cover-upload.ts (convertToJpg → upload → getPublicUrl), but targets
// the teacher cover (hero) bucket.
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { formatFileSize } from '@/lib/format'
import {
  MAX_TEACHER_BRANDING_SIZE_BYTES,
  TEACHER_COVERS_BUCKET,
} from '@/lib/teacher-branding'

export async function uploadTeacherCover(
  file: File,
  teacherId: string,
): Promise<{ url: string; path: string }> {
  const supabase = createClient()

  // Always JPEG (app-wide convention). The converted blob is the real payload —
  // check it against the bucket limit rather than the raw file, which compresses.
  const body = await convertToJpg(file)
  if (body.size > MAX_TEACHER_BRANDING_SIZE_BYTES) {
    throw new Error(
      `Image is too large after processing. Max ${formatFileSize(MAX_TEACHER_BRANDING_SIZE_BYTES)}.`,
    )
  }

  // [MT] teacher-covers RLS checks ONLY segment [1] of the path
  // (is_teacher_admin(((storage.foldername(name))[1])::uuid)). Segment [1] MUST be
  // teacherId — it is the whole write check; no {uid} segment is needed (unlike the
  // member buckets, this bucket has no [2]=auth.uid() conjunct).
  const path = `${teacherId}/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage
    .from(TEACHER_COVERS_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg' })
  if (error) {
    throw error
  }

  const url = supabase.storage
    .from(TEACHER_COVERS_BUCKET)
    .getPublicUrl(path).data.publicUrl

  return { url, path }
}
