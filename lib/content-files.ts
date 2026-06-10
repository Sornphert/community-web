// Shared constants for classroom document lessons (content_items, type='document').
//
// MAX_CONTENT_FILE_SIZE_BYTES is the single source of truth for the size limit.
// The `content-files` storage bucket's `file_size_limit` MUST be set to this same
// number (see supabase/seed.sql) — the bucket is the real server-side gate; the
// client check is a UX nicety. Mirrors lib/attachments.ts.
export const MAX_CONTENT_FILE_SIZE_BYTES = 20971520 // 20 MB

export const CONTENT_FILES_BUCKET = 'content-files'

export const PDF_MIME = 'application/pdf'

// A lesson file is either an image (uploaded as JPEG) or a PDF. MIME is the
// declared file.type — best-effort, not byte-sniffed (matches post attachments).
export function isAllowedLessonFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === PDF_MIME
}
