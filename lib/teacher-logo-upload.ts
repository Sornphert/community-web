// Browser-only helper: convert a picked image to JPEG and upload it to the
// `teacher-logos` bucket, returning the public URL + storage path. Mirrors
// lib/teacher-cover-upload.ts exactly, targeting the teacher logo bucket.
import { createClient } from '@/lib/supabase/client'
import { convertToJpg } from '@/lib/image'
import { formatFileSize } from '@/lib/format'
import {
  MAX_TEACHER_BRANDING_SIZE_BYTES,
  TEACHER_LOGOS_BUCKET,
} from '@/lib/teacher-branding'

export async function uploadTeacherLogo(
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

  // [MT] teacher-logos RLS checks ONLY segment [1] (is_teacher_admin(segment[1])).
  // Segment [1] MUST be teacherId — the whole write check; no {uid} segment needed.
  const path = `${teacherId}/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage
    .from(TEACHER_LOGOS_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg' })
  if (error) {
    throw error
  }

  const url = supabase.storage
    .from(TEACHER_LOGOS_BUCKET)
    .getPublicUrl(path).data.publicUrl

  return { url, path }
}
