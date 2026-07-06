// Plain shared constants for the channel admin surface. Kept import-free (no server/client
// deps) so both the 'use server' actions and the client manager can import it — a
// 'use server' module may only export async functions, so the bound cannot live there.
// (Same gotcha as lib/tag-constants.ts.)
export const MAX_CHANNEL_NAME_LEN = 50
