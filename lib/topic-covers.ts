// Shared constants for classroom topic cover images (topics.cover_image_url).
//
// MAX_TOPIC_COVER_SIZE_BYTES is the single source of truth for the size limit and
// MUST match the `topic-covers` storage bucket's `file_size_limit` (see
// supabase/seed.sql) — the bucket is the real server-side gate. Covers are always
// uploaded as JPEG via convertToJpg (downscaled to ≤2000px @ 0.85), so the
// converted blob is normally well under this; we check the blob, not the raw file.
// Mirrors lib/content-files.ts.
export const MAX_TOPIC_COVER_SIZE_BYTES = 2097152 // 2 MB

export const TOPIC_COVERS_BUCKET = 'topic-covers'

// Covers are images only (no PDF). MIME is the declared file.type — best-effort,
// not byte-sniffed (matches post attachments / lesson files).
export function isAllowedCoverImage(file: File): boolean {
  return file.type.startsWith('image/')
}
