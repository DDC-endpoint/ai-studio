// The worker's loops, by name. Side-effect free (no imports, nothing started),
// so a unit test can read the set without booting the worker. 037 D9: only
// analytics retention remains.
export const LOOPS = ['retention'] as const
export type LoopName = (typeof LOOPS)[number]
