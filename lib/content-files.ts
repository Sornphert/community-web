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

// Excel detection is MIME-first with an extension fallback: some browsers report
// an empty or generic (application/octet-stream) type for .xls/.xlsx, so the
// declared file.type alone is not reliable for spreadsheets.
export function isExcelFile(file: File): boolean {
  if (file.type === XLSX_MIME || file.type === XLS_MIME) return true
  const name = file.name.toLowerCase()
  return name.endsWith('.xlsx') || name.endsWith('.xls')
}

// A lesson file is an image (uploaded as JPEG), a PDF, or an Excel spreadsheet.
// MIME is the declared file.type — best-effort, not byte-sniffed (matches post
// attachments) — with an extension fallback for Excel.
export function isAllowedLessonFile(file: File): boolean {
  return (
    file.type.startsWith('image/') ||
    file.type === PDF_MIME ||
    isExcelFile(file)
  )
}

// Explicit per-type resolution of the stored extension + content-type. There is
// deliberately NO "else → PDF" default: an unrecognized type returns null so the
// caller can reject it instead of silently mis-storing it (e.g. a spreadsheet
// stamped as .pdf, which then fails to open). `isImage` tells the caller to run
// the client-side JPEG conversion; PDF and Excel upload as-is.
export type LessonUploadKind = {
  ext: 'jpg' | 'pdf' | 'xlsx' | 'xls'
  contentType: string
  isImage: boolean
}

export function resolveLessonUpload(file: File): LessonUploadKind | null {
  if (file.type.startsWith('image/')) {
    return { ext: 'jpg', contentType: 'image/jpeg', isImage: true }
  }
  if (file.type === PDF_MIME) {
    return { ext: 'pdf', contentType: PDF_MIME, isImage: false }
  }
  if (isExcelFile(file)) {
    const isXlsx =
      file.type === XLSX_MIME || file.name.toLowerCase().endsWith('.xlsx')
    return isXlsx
      ? { ext: 'xlsx', contentType: XLSX_MIME, isImage: false }
      : { ext: 'xls', contentType: XLS_MIME, isImage: false }
  }
  return null
}
