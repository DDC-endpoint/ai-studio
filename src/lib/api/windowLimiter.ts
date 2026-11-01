// A per-key rolling window limiter (006 FR-08, 039 D16): at most `limit` calls in
// any rolling `windowMs`. In-process on purpose (one web instance; a restart
// resets it, which only ever lets a few extra calls through). A refused call is
// not recorded, so refusals never extend the lockout.
//
// Above SWEEP_AT tracked keys the map is swept of stale entries on the way in.
const SWEEP_AT = 1000

export interface WindowLimiter {
  /** True when `key` may make one more call now; records the call when so. */
  allow(key: string, now?: number): boolean
  /** Milliseconds until `key` has room again (0 when it has room now). */
  retryAfterMs(key: string, now?: number): number
  /** Test helper: forget every window. */
  reset(): void
}

export function createWindowLimiter(limit: number, windowMs: number): WindowLimiter {
  const windows = new Map<string, number[]>()
  return {
    allow(key, now = Date.now()) {
      if (windows.size > SWEEP_AT) {
        for (const [id, stamps] of windows) {
          if (stamps.length === 0 || now - stamps[stamps.length - 1] >= windowMs) windows.delete(id)
        }
      }
      const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= limit) {
        windows.set(key, recent)
        return false
      }
      recent.push(now)
      windows.set(key, recent)
      return true
    },
    retryAfterMs(key, now = Date.now()) {
      const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs)
      if (recent.length < limit) return 0
      return recent[recent.length - limit] + windowMs - now
    },
    reset() {
      windows.clear()
    },
  }
}
