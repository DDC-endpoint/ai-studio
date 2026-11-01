import { describe, it, expect } from 'vitest'
import { monthStartUtc } from '@/lib/dates'

describe('monthStartUtc', () => {
  it('returns the first instant of the month for a mid-month time', () => {
    expect(monthStartUtc(new Date('2026-10-15T12:34:56.789Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('keeps the month at 23:59:59.999 UTC on the last day', () => {
    expect(monthStartUtc(new Date('2026-10-31T23:59:59.999Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('returns the same instant at 00:00:00.000 UTC on the 1st', () => {
    expect(monthStartUtc(new Date('2026-11-01T00:00:00.000Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('uses the UTC month, not the local one, for an offset-looking time', () => {
    // 2026-11-01 02:00 at +05:00 is still 2026-10-31 21:00 UTC.
    expect(monthStartUtc(new Date('2026-11-01T02:00:00+05:00')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
    // 2026-10-31 23:00 at -05:00 is already 2026-11-01 04:00 UTC.
    expect(monthStartUtc(new Date('2026-10-31T23:00:00-05:00')).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('handles the year boundary and a leap-year February', () => {
    expect(monthStartUtc(new Date('2027-01-01T00:00:00.000Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(monthStartUtc(new Date('2028-02-29T23:59:59.999Z')).toISOString()).toBe('2028-02-01T00:00:00.000Z')
  })
})
