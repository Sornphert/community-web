// Shared constants for post PDF attachments.
//
// MAX_ATTACHMENT_SIZE_BYTES is the single source of truth for the size limit.
// The `post-attachments` storage bucket's `file_size_limit` MUST be set to this
// same number (see supabase/migrations/0011_post_attachments.sql) — the bucket
// is the real server-side gate; the client check below is a UX nicety.
export const MAX_ATTACHMENT_SIZE_BYTES = 26214400 // 25 MB

export const PDF_MIME = 'application/pdf'
