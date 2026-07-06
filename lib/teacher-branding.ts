// Shared constants for per-teacher branding: the cover (hero) + logo images
// (teachers.cover_url / logo_url) and the directory description (teachers.description).
//
// MAX_TEACHER_BRANDING_SIZE_BYTES is the single source of truth for the image size
// limit and MUST match both the `teacher-covers` and `teacher-logos` bucket
// `file_size_limit` (see supabase/multitenant/seed.sql) — the bucket is the real
// server-side gate. Images are always uploaded as JPEG via convertToJpg, so the
// converted blob is normally well under this; we check the blob, not the raw file.
// Mirrors lib/topic-covers.ts.
export const MAX_TEACHER_BRANDING_SIZE_BYTES = 2097152 // 2 MB

export const TEACHER_COVERS_BUCKET = 'teacher-covers'
export const TEACHER_LOGOS_BUCKET = 'teacher-logos'

// Directory description cap (chars). UI-enforced; the column stays nullable (NOT
// NULL is deferred to a later migration).
export const MAX_TEACHER_DESCRIPTION_LEN = 500

// Community name cap (chars). UI + action enforced; teachers.name is NOT NULL with
// no DB length constraint, so this is the only length gate.
export const MAX_TEACHER_NAME_LEN = 80

// Branding images are images only (no PDF). MIME is the declared file.type —
// best-effort, not byte-sniffed (matches topic covers / lesson files).
export function isAllowedBrandingImage(file: File): boolean {
  return file.type.startsWith('image/')
}
