// The per-user window for POST /api/events (006 FR-08): at most LIMIT events in
// any rolling WINDOW_MS. In-process on purpose (one web instance; a restart
// resets it, which only ever lets a few extra events through). The route counts
// each refused event in AnalyticsDrop, so a refusal never reads as a healthy zero.
import { createWindowLimiter } from '@/lib/api/windowLimiter'

export const EVENTS_PER_WINDOW = 60
export const WINDOW_MS = 60_000

const limiter = createWindowLimiter(EVENTS_PER_WINDOW, WINDOW_MS)

/** True when `userId` may send one more event now; records the event when so. */
export function allow(userId: string, now: number = Date.now()): boolean {
  return limiter.allow(userId, now)
}

/** Test helper: forget every window. */
export function resetRateLimit(): void {
  limiter.reset()
}
