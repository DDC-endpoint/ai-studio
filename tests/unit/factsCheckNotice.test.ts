import { describe, it, expect } from 'vitest'
import { factsNoticeFor, ERROR_MESSAGE } from '@/lib/drafts/factsCheckNotice'
import { FACT_WHERE, type FactsCheck } from '@/lib/factsCheck/types'

const at = '2026-10-24T00:00:00.000Z'

describe('factsNoticeFor', () => {
  it('names each value and where', () => {
    const check: FactsCheck = {
      v: 1,
      status: 'flagged',
      checkedAt: at,
      flagged: [
        { kind: 'cur', value: '$49', where: 'INSTAGRAM' },
        { kind: 'date', value: '30 March', where: 'headline' },
        { kind: 'pct', value: '35%', where: 'LINKEDIN' },
      ],
    }
    const n = factsNoticeFor(check)
    expect(n?.status).toBe('flagged')
    expect(n?.message).toBe(
      '$49 (Instagram caption), 30 March (headline), 35% (LinkedIn caption). These are not in your brief, project or brand voice. Check them before you download it.',
    )
  })
  it('error says the check could not run', () => {
    const n = factsNoticeFor({ v: 1, status: 'error', checkedAt: at, flagged: [], reason: 'x' })
    expect(n).toStrictEqual({ status: 'error', items: [], message: ERROR_MESSAGE })
  })
  it('clear, flagged-but-empty and null give nothing', () => {
    expect(factsNoticeFor({ v: 1, status: 'clear', checkedAt: at, flagged: [] })).toBeNull()
    expect(factsNoticeFor({ v: 1, status: 'flagged', checkedAt: at, flagged: [] })).toBeNull()
    expect(factsNoticeFor(null)).toBeNull()
    expect(factsNoticeFor(undefined)).toBeNull()
  })
})

describe('factsNoticeFor labels (039 AC-03)', () => {
  it('every FACT_WHERE value has a label, and the general caption is named', () => {
    for (const where of FACT_WHERE) {
      const n = factsNoticeFor({
        v: 1,
        status: 'flagged',
        checkedAt: at,
        flagged: [{ kind: 'num', value: '7', where }],
      })
      const label = n?.status === 'flagged' ? n.items[0].where : undefined
      expect(label, where).toBeTruthy()
      if (where !== 'headline') expect(label, where).toMatch(/ caption$/)
    }
    const general = factsNoticeFor({
      v: 1,
      status: 'flagged',
      checkedAt: at,
      flagged: [{ kind: 'cur', value: '$49', where: 'GENERAL' }],
    })
    expect(general?.message).toContain('$49 (general caption)')
    const facebook = factsNoticeFor({
      v: 1,
      status: 'flagged',
      checkedAt: at,
      flagged: [{ kind: 'cur', value: '$49', where: 'FACEBOOK' }],
    })
    expect(FACT_WHERE).toContain('FACEBOOK')
    expect(facebook?.message).toContain('$49 (Facebook caption)')
  })
})
