import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { MOCK_AI } from '@/lib/testHooks'
import { setCaptionLimitOverride } from '@/lib/captions/limits'

/**
 * Test-only seam (039 D16, FR-21): set the caption action limit, or clear it
 * with `{ limit: null }`. Under MOCK_AI with no override the limit does not
 * apply. Dormant in production: hard 404 in prod builds, 404 unless MOCK_AI is
 * set, and admin-gated on top.
 */
const bodySchema = z.object({ limit: z.number().int().min(1).nullable() })

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  setCaptionLimitOverride(parsed.data.limit)
  return NextResponse.json({ ok: true })
}
