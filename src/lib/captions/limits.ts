// The caption action limit (039 D16): at most CAPTION_ACTIONS_PER_WINDOW
// curate/regenerate calls per user per CAPTION_WINDOW_MS, checked before the
// claim. In-process, like the events limiter.
import { createWindowLimiter, type WindowLimiter } from '@/lib/api/windowLimiter'
import { MOCK_AI } from '@/lib/testHooks'

export const CAPTION_ACTIONS_PER_WINDOW = 30
export const CAPTION_WINDOW_MS = 600_000

export const captionLimiter = createWindowLimiter(CAPTION_ACTIONS_PER_WINDOW, CAPTION_WINDOW_MS)

// The test seam's override (POST /api/test/caption-limit): a fresh limiter with
// its own limit, kept on globalThis so one value spans Turbopack module
// instances (as mockGenFailedOnce does). Setting it starts a clean window.
type LimitGlobal = { __captionLimitOverride?: WindowLimiter }
const store = globalThis as LimitGlobal

export function setCaptionLimitOverride(limit: number | null): void {
  if (limit === null) delete store.__captionLimitOverride
  else store.__captionLimitOverride = createWindowLimiter(limit, CAPTION_WINDOW_MS)
}

/**
 * Admit one caption action for `userId`, or say how long to wait (seconds, at
 * least 1). Under MOCK_AI with no override the limit does not apply, so the
 * many caption calls of a full mock run cannot trip it.
 */
export function admitCaptionAction(
  userId: string,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  let limiter = captionLimiter
  if (MOCK_AI) {
    const override = store.__captionLimitOverride
    if (!override) return { ok: true }
    limiter = override
  }
  if (limiter.allow(userId, now)) return { ok: true }
  return {
    ok: false,
    retryAfterSec: Math.max(1, Math.ceil(limiter.retryAfterMs(userId, now) / 1000)),
  }
}
