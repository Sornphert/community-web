// Shared constants for post PDF attachments.
//
// MAX_ATTACHMENT_SIZE_BYTES is the single source of truth for the size limit.
// The `post-attachments` storage bucket's `file_size_limit` MUST be set to this
// same number (see supabase/migrations/0011_post_attachments.sql) — the bucket
// is the real server-side gate; the client check below is a UX nicety.
export const MAX_ATTACHMENT_SIZE_BYTES = 26214400 // 25 MB

export const PDF_MIME = 'application/pdf'

export const POST_ATTACHMENTS_BUCKET = 'post-attachments'

// How long a minted attachment url stays valid (0020). Long enough to open/download,
// short enough that a leaked link isn't permanent access.
export const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

// The bucket is PRIVATE (0020), so the stored /object/public/... url no longer
// resolves. Re-derive the in-bucket path so we can sign it. Prefer storage_path;
// fall back to parsing a legacy public url. Returns null for anything that isn't
// one of ours, which the caller then passes through untouched.
export function attachmentPathFrom(
  storagePath: string | null,
  url: string | null,
): string | null {
  if (storagePath && storagePath.trim() !== '') return storagePath
  if (!url) return null
  const m = url.match(/\/post-attachments\/(.+?)(?:\?|$)/)
  return m ? decodeURIComponent(m[1]) : null
}
