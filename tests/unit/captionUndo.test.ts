// 039 D4, D15: the undo snapshot (pure). T3 adds the store's delete and undo.
import { describe, it, expect } from 'vitest'
import { captionSnapshotSchema, parseCaptionSnapshot, snapshotOf } from '@/lib/captions/undo'

const row = {
  text: 'Hello',
  deletedAt: null as Date | null,
  model: 'claude-sonnet-5-5',
  modelSubstitutedFrom: null,
  route: 'CLI',
  generalHash: 'abcd1234abcd1234',
}

describe('snapshotOf', () => {
  it('records the text, the stamp and the source hash, v 1', () => {
    expect(snapshotOf(row)).toEqual({
      v: 1,
      text: 'Hello',
      deleted: false,
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: null,
      route: 'CLI',
      generalHash: 'abcd1234abcd1234',
    })
  })

  it('a soft-deleted row records deleted: true (Undo returns to the deleted state)', () => {
    expect(snapshotOf({ ...row, deletedAt: new Date('2026-11-02T00:00:00Z') }).deleted).toBe(true)
  })

  it('round-trips through parseCaptionSnapshot', () => {
    expect(parseCaptionSnapshot(snapshotOf(row))).toEqual(snapshotOf(row))
  })
})

describe('parseCaptionSnapshot (null on anything unreadable, never throws)', () => {
  const { route: _route, ...withoutRoute } = snapshotOf(row)
  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['a wrong version', { ...snapshotOf(row), v: 2 }],
    ['a missing field', withoutRoute],
    ['an extra key', { ...snapshotOf(row), extra: 1 }],
    ['a non-string text', { ...snapshotOf(row), text: 5 }],
  ])('%s', (_name, raw) => {
    expect(parseCaptionSnapshot(raw)).toBeNull()
  })

  it('the schema is strict', () => {
    expect(captionSnapshotSchema.safeParse({ ...snapshotOf(row), extra: 1 }).success).toBe(false)
  })
})
