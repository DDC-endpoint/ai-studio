// The fixed failure list of a Download (037 D7). Pure, so the analytics
// catalogue can import it without pulling in prisma.
export const DOWNLOAD_FAILURES = ['render-failed', 'composite-not-placed', 'changed', 'not-ready'] as const
export type DownloadFailure = (typeof DOWNLOAD_FAILURES)[number]
