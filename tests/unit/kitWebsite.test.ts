// 039 D6 / AC-19: the kit website is user input that code inserts into a Facebook
// caption, so only an https URL is accepted (pure), and only a team admin sets it.
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('parseKitWebsite', () => {
  it('accepts an https URL and keeps it as typed after the trim', async () => {
    const { parseKitWebsite } = await import('@/lib/brandkit/website')
    expect(parseKitWebsite('https://acme.example')).toEqual({ ok: true, website: 'https://acme.example' })
    expect(parseKitWebsite('  https://acme.example/path?q=1#top  ')).toEqual({
      ok: true,
      website: 'https://acme.example/path?q=1#top',
    })
  })

  it.each([
    ['http', 'http://acme.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['credentials', 'https://user:pw@acme.example'],
    ['a dotless host', 'https://localhost'],
    ['a space inside', 'https://acme.example/a b'],
    ['no scheme', 'acme.example'],
    ['empty', ''],
    ['blank', '   '],
    ['2,049 characters', `https://acme.example/${'a'.repeat(2049 - 'https://acme.example/'.length)}`],
  ])('refuses %s', async (_name, value) => {
    const { parseKitWebsite, KIT_WEBSITE_ERROR } = await import('@/lib/brandkit/website')
    expect(parseKitWebsite(value)).toEqual({ ok: false, error: KIT_WEBSITE_ERROR })
  })

  it('accepts exactly 2,048 characters, and refuses a non-string', async () => {
    const { parseKitWebsite } = await import('@/lib/brandkit/website')
    const edge = `https://acme.example/${'a'.repeat(2048 - 'https://acme.example/'.length)}`
    expect(edge).toHaveLength(2048)
    expect(parseKitWebsite(edge).ok).toBe(true)
    expect(parseKitWebsite(42).ok).toBe(false)
    expect(parseKitWebsite(null).ok).toBe(false)
  })
})

// The route: 400 with the message, null clears, and nothing is written on a refusal.
const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { brandKit: { findUnique: h.findUnique }, $transaction: h.transaction },
}))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request, schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }) => {
    const parsed = schema.safeParse(await req.json())
    return parsed.success ? { data: parsed.data } : { response: new Response('bad', { status: 400 }) }
  }
  return { parseBody, withTeamAdmin: wrap, withTeamAuth: wrap }
})

const patch = async (body: unknown) => {
  const { PATCH } = await import('@/app/api/admin/brandkits/[id]/route')
  return PATCH(
    new Request('http://t/api/admin/brandkits/k1', { method: 'PATCH', body: JSON.stringify(body) }) as never,
    { params: { id: 'k1' } } as never,
  ) as Promise<Response>
}

describe('PATCH /api/admin/brandkits/[id] website', () => {
  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset()
    h.findUnique.mockResolvedValue({ id: 'k1', teamId: 'team1', isDeleted: false, fonts: [] })
    h.update.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'k1', ...(data as object) }))
    h.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ brandKit: { update: h.update, updateMany: h.updateMany } }),
    )
  })

  it('an https value is stored trimmed', async () => {
    const res = await patch({ website: '  https://acme.example  ' })
    expect(res.status).toBe(200)
    expect(h.update.mock.calls[0][0].data).toMatchObject({ website: 'https://acme.example' })
  })

  it('null clears it', async () => {
    const res = await patch({ website: null })
    expect(res.status).toBe(200)
    expect(h.update.mock.calls[0][0].data).toMatchObject({ website: null })
  })

  it('absent leaves it alone', async () => {
    await patch({ name: 'New' })
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty('website')
  })

  it.each(['http://acme.example', 'javascript:alert(1)', 'https://localhost', 'https://u:p@acme.example', ''])(
    'refuses %j with 400 and the message, and writes nothing',
    async (value) => {
      const res = await patch({ website: value })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'website must be an https URL' })
      expect(h.update).not.toHaveBeenCalled()
    },
  )
})
