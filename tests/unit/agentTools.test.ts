import { describe, it, expect, vi, beforeEach } from 'vitest'

// 038 FR-20 / AC-26: the API-mode agent's getBrandKitContext tool returns the kit
// of the run's own PostContext, loaded by kit id and team. It keeps no copy of the
// kit precedence and reads no brief.

const h = vi.hoisted(() => ({
  kitFindFirst: vi.fn(),
  briefFind: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKit: { findFirst: h.kitFindFirst },
    brief: { findUnique: h.briefFind, findUniqueOrThrow: h.briefFind },
  },
}))
vi.mock('@/lib/renderer/puppeteer', () => ({ renderPost: vi.fn() }))
vi.mock('@/lib/storage/minio', () => ({
  uploadObject: vi.fn(),
  resolveExportUrl: vi.fn(),
  persistDataUrlImage: vi.fn(),
  exportKey: () => 'k',
  BUCKET_EXPORTS: 'exports',
}))
vi.mock('@/providers/registry', () => ({ resolveImageProvider: vi.fn() }))

const { toolGetBrandKitContext } = await import('@/lib/agent/tools')
const { ctxFor } = await import('../helpers/postContext')

const kit = { id: 'kit-run', name: 'Run kit' } as never
const row = {
  colors: ['#14377D'],
  fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato' }],
  logoUrl: 'https://cdn.example.com/logo.svg',
  prompts: [{ content: 'Warm and direct.' }],
  artifacts: [{ url: 'https://cdn.example.com/ref.png' }],
}

beforeEach(() => {
  h.kitFindFirst.mockReset().mockResolvedValue(row)
  h.briefFind.mockReset()
})

describe('toolGetBrandKitContext', () => {
  it('returns the run’s context kit, loaded by its id and the run’s team', async () => {
    const out = await toolGetBrandKitContext(ctxFor(kit, null, 'team-run'))
    expect(out).toEqual({
      colors: ['#14377D'],
      fonts: [{ name: 'Lato', url: 'https://fonts.example.com/lato' }],
      logoUrl: 'https://cdn.example.com/logo.svg',
      voicePrompt: 'Warm and direct.',
      artifactUrls: ['https://cdn.example.com/ref.png'],
    })
    expect(h.kitFindFirst).toHaveBeenCalledTimes(1)
    expect(h.kitFindFirst.mock.calls[0][0].where).toEqual({ id: 'kit-run', teamId: 'team-run', isDeleted: false })
    expect(h.kitFindFirst.mock.calls[0][0].include.artifacts).toEqual({ where: { feedToAI: true } })
  })

  it('reads no brief, whatever id the model names', async () => {
    // The tool takes the context only: a model-supplied briefId has nothing to read it with.
    expect(toolGetBrandKitContext.length).toBe(1)
    await toolGetBrandKitContext(ctxFor(kit))
    expect(h.briefFind).not.toHaveBeenCalled()
  })

  it('a run with no kit gets the empty context and no query', async () => {
    const out = await toolGetBrandKitContext(ctxFor(null))
    expect(out).toEqual({ colors: [], fonts: [], logoUrl: null, voicePrompt: null, artifactUrls: [] })
    expect(h.kitFindFirst).not.toHaveBeenCalled()
  })

  it('a kit that has since been deleted gets the empty context', async () => {
    h.kitFindFirst.mockResolvedValue(null)
    const out = await toolGetBrandKitContext(ctxFor(kit))
    expect(out.colors).toEqual([])
    expect(out.voicePrompt).toBeNull()
  })

  it('a missing context (a caller that predates it) gets the empty context', async () => {
    expect(await toolGetBrandKitContext(undefined)).toMatchObject({ colors: [], artifactUrls: [] })
  })
})
