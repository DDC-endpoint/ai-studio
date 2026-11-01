// 006 T2: the settle-point emitter of draft actions (037 removed the publish
// and scheduler emitters). The real track() runs against a prisma fake that captures
// analyticsEvent.create, so each case asserts the ROW an operation would store:
// exactly one per operation and outcome (FR-04), the right source (FR-04), and
// that a failing insert changes neither the action's domain writes nor its
// return value (AC-08, unit half).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  draftUpdateMany: vi.fn(),
  revisionUpdateMany: vi.fn(),
  resolveClaudeAuth: vi.fn(),
  runWithClaudeAuth: vi.fn(),
  eventCreate: vi.fn(),
  dropUpsert: vi.fn(),
  queryRaw: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: h.queryRaw,
    // Batch form only (completeDraftAction).
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
    draft: {
      updateMany: h.draftUpdateMany,
    },
    draftRevision: { updateMany: h.revisionUpdateMany },
    analyticsEvent: { create: h.eventCreate },
    analyticsDrop: { upsert: h.dropUpsert },
  },
}))
vi.mock('@/lib/agent/userToken', () => ({ resolveClaudeAuth: h.resolveClaudeAuth }))
vi.mock('@/lib/agent/claudeAuth', () => ({ runWithClaudeAuth: h.runWithClaudeAuth }))

const { startDraftAction } = await import('@/lib/drafts/draftActions')
const { newActionTrace } = await import('@/lib/analytics/trace')

const CLAIM = { action: 'REFINE', claimId: 'tok-1' } as const

type StoredEvent = {
  name: string
  source: string
  teamId: string
  userId: string | null
  draftId: string | null
  durationMs: number | null
  outcome: string | null
  payload: Record<string, unknown>
}
const events = () => h.eventCreate.mock.calls.map((c) => (c[0] as { data: StoredEvent }).data)
const only = () => {
  expect(events()).toHaveLength(1)
  return events()[0]
}
const failInserts = () => h.eventCreate.mockRejectedValue(new Error('insert failed'))

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.revisionUpdateMany.mockResolvedValue({ count: 1 })
  h.resolveClaudeAuth.mockResolvedValue(null)
  h.runWithClaudeAuth.mockImplementation((_a: unknown, fn: () => unknown) => fn())
  h.eventCreate.mockResolvedValue({})
  h.dropUpsert.mockResolvedValue({})
})

// startDraftAction releases on an un-awaited chain: wait for the whole run.
async function settled() {
  await vi.waitFor(() => expect(h.draftUpdateMany).toHaveBeenCalled())
  // The emission follows the release write; let the chain finish.
  await new Promise((r) => setTimeout(r, 20))
}

describe('draft_action.settled (FR-04, FR-05)', () => {
  it('ok: one event with the action, the duration and the trace fields', async () => {
    const trace = newActionTrace()
    trace.fields.model = { model: 'SONNET', modelId: 'claude-sonnet-5-5' }
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, trace)
    await settled()
    const e = only()
    expect(e).toMatchObject({
      name: 'draft_action.settled',
      source: 'web',
      teamId: 'team1',
      userId: 'u1',
      draftId: 'd1',
      outcome: 'ok',
    })
    expect(e.payload).toMatchObject({ action: 'REFINE', model: { model: 'SONNET' } })
    expect(e.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('037 D5: a channel in the trace fields reaches the payload', async () => {
    const trace = newActionTrace()
    trace.fields.channel = 'INSTAGRAM'
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, trace)
    await settled()
    expect(only().payload).toMatchObject({ action: 'REFINE', channel: 'INSTAGRAM' })
  })

  it('not-applied: a clean release, outcome not-applied', async () => {
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => 'not-applied', undefined, newActionTrace())
    await settled()
    expect(only().outcome).toBe('not-applied')
  })

  it('conflict: the trace marker turns a clean completion into outcome conflict', async () => {
    const trace = newActionTrace()
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => { trace.outcome = 'conflict' }, undefined, trace)
    await settled()
    expect(only().outcome).toBe('conflict')
  })

  it('failed: the redacted message is the failureReason, and the release still carries it', async () => {
    await startDraftAction(
      'd1',
      'u1',
      'team1',
      CLAIM,
      async () => {
        throw new Error('model timed out')
      },
      undefined,
      newActionTrace(),
    )
    await settled()
    const e = only()
    expect(e.outcome).toBe('failed')
    expect(e.payload.failureReason).toBe('model timed out')
    expect(h.draftUpdateMany.mock.calls.at(-1)![0].data).toMatchObject({ pendingActionError: 'model timed out' })
  })

  it('no trace, no event (callers that do not opt in emit nothing)', async () => {
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {})
    await settled()
    expect(events()).toHaveLength(0)
  })

  it('a settle that lost its claim emits nothing (the swept event covered it)', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    await startDraftAction('d1', 'u1', 'team1', CLAIM, async () => {}, undefined, newActionTrace())
    await settled()
    expect(events()).toHaveLength(0)
  })

  it('AC-08: a failing insert leaves the domain writes identical (ok and failed)', async () => {
    const run = async (work: () => Promise<void>) => {
      h.draftUpdateMany.mockClear()
      h.eventCreate.mockClear()
      await startDraftAction('d1', 'u1', 'team1', CLAIM, work, undefined, newActionTrace())
      await settled()
      return h.draftUpdateMany.mock.calls.map((c) => c[0])
    }
    const okWith = await run(async () => {})
    failInserts()
    const okFailing = await run(async () => {})
    expect(okFailing).toEqual(okWith)
    h.eventCreate.mockResolvedValue({})
    const boom = async () => {
      throw new Error('boom')
    }
    const failWith = await run(boom)
    failInserts()
    const failFailing = await run(boom)
    expect(failFailing).toEqual(failWith)
    // The loss is counted, not thrown.
    await vi.waitFor(() => expect(h.dropUpsert).toHaveBeenCalled())
  })
})
