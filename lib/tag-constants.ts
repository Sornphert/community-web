// Plain shared constants for the tag admin surfaces. Kept import-free (no server/client
// deps) so both the 'use server' actions and the client manager can import it — a
// 'use server' module may only export async functions, so the bound cannot live there.
export const MAX_TAG_NAME_LEN = 50
