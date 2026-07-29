// Shared constants for classroom document lessons (content_items, type='document').
//
// MAX_CONTENT_FILE_SIZE_BYTES is the single source of truth for the size limit.
// The `content-files` storage bucket's `file_size_limit` MUST be set to this same
// number (see supabase/seed.sql) — the bucket is the real server-side gate; the
// client check is a UX nicety. Mirrors lib/attachments.ts.
export const MAX_CONTENT_FILE_SIZE_BYTES = 20971520 // 20 MB

export const CONTENT_FILES_BUCKET = 'content-files'

// How long a minted document url stays valid. Long enough to open/read a lesson,
// short enough that a leaked link is not permanent access (0019).
export const CONTENT_FILE_SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

// The bucket is PRIVATE (0019), so a stored /object/public/... url no longer resolves.
// Given a content_items row we must re-derive the in-bucket path and sign it.
// Prefer document_storage_path; fall back to parsing a legacy public url written
// before that column existed. Returns null for genuinely EXTERNAL urls (e.g. seed
// rows pointing at example.com), which are passed through untouched.
export function contentFilePathFrom(
  storagePath: string | null,
  url: string | null,
): string | null {
  if (storagePath && storagePath.trim() !== '') return storagePath
  if (!url) return null
  // .../object/public/content-files/<path>  or  .../object/sign/content-files/<path>
  const m = url.match(/\/content-files\/(.+?)(?:\?|$)/)
  return m ? decodeURIComponent(m[1]) : null
}

export const PDF_MIME = 'application/pdf'
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const XLS_MIME = 'application/vnd.ms-excel'

// Allowed NON-image document extensions → the content-type to store them with.
// Images are handled separately (converted to JPEG). Detection is extension-first
// (browsers often report empty/generic file.type for Office/CSV files), falling back
// to the declared file.type when a known extension isn't present.
const DOC_TYPES: Record<string, string> = {
  pdf: PDF_MIME,
  xlsx: XLSX_MIME,
  xls: XLS_MIME,
  csv: 'text/csv',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'application/rtf',
  key: 'application/octet-stream',
  pages: 'application/octet-stream',
  numbers: 'application/octet-stream',
  zip: 'application/zip',
}

// The `accept` attribute for the file picker — images plus the common document types.
export const LESSON_FILE_ACCEPT = `image/*,${Object.keys(DOC_TYPES)
  .map((e) => `.${e}`)
  .join(',')}`

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

// A lesson file is an image (uploaded as JPEG) or one of the common document types.
export function isAllowedLessonFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return extensionOf(file.name) in DOC_TYPES
}

// Resolve the stored extension + content-type. Images convert to JPEG (isImage);
// everything else uploads as-is keyed on its extension. Unknown types return null so
// the caller rejects them rather than mis-storing them.
export type LessonUploadKind = {
  ext: string
  contentType: string
  isImage: boolean
}

export function resolveLessonUpload(file: File): LessonUploadKind | null {
  if (file.type.startsWith('image/')) {
    return { ext: 'jpg', contentType: 'image/jpeg', isImage: true }
  }
  const ext = extensionOf(file.name)
  if (ext in DOC_TYPES) {
    // Prefer the declared file.type when present + specific; else the mapped type.
    const contentType =
      file.type && file.type !== 'application/octet-stream'
        ? file.type
        : DOC_TYPES[ext]
    return { ext, contentType, isImage: false }
  }
  return null
}
