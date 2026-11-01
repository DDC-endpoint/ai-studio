// Final whole-branch review, C1: resolveBrandKit's last-resort "team default"
// tier ran with no teamId filter at all (`findFirst({ isDefault: true,
// isDeleted: false })`), so any team without its own kit silently generated
// with whichever OTHER team's default kit findFirst happened to return first.
// This is a focused unit test on resolveBrandKit itself (mocked prisma), which
// asserts the DB is queried WITH teamId at every tier — not just that the
// function returns a plausible-looking kit. The mock only "finds" a kit when
// the where clause's teamId matches the row's own team, so a regression that
// dropped teamId from any tier's where clause would make the corresponding
// assertion fail (the mock would see teamId: undefined and match nothing, or
// — worse, if the two teams' fixtures were swapped — return the wrong team's
// kit; either way the test catches it).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  brandKitFindFirst: vi.fn(),
  projectFindFirst: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKit: { findFirst: mocks.brandKitFindFirst },
    project: { findFirst: mocks.projectFindFirst },
  },
}))

import { resolveBrandKit } from '@/lib/brandkit/resolve'

const TEAM_A = 'team-a'
const TEAM_B = 'team-b'

const kitA = { id: 'kit-a', name: 'Team A Kit', colors: [], fonts: [], logoUrl: null, prompts: [] }
const kitB = { id: 'kit-b', name: 'Team B Kit', colors: [], fonts: [], logoUrl: null, prompts: [] }

describe('resolveBrandKit — team scoping (final review C1)', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('team-default tier', () => {
    it('only resolves the CALLING team\'s default kit, never another team\'s', async () => {
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { teamId: string; isDefault: boolean } }) => {
        if (where.isDefault && where.teamId === TEAM_A) return kitA
        if (where.isDefault && where.teamId === TEAM_B) return kitB
        return null
      })

      const resolvedA = await resolveBrandKit(TEAM_A)
      expect(resolvedA?.id).toBe('kit-a')
      expect(resolvedA?.source).toBe('team')

      const resolvedB = await resolveBrandKit(TEAM_B)
      expect(resolvedB?.id).toBe('kit-b')

      // Every call to the default-tier lookup must have carried the caller's
      // own teamId — proves the where clause is scoped, not global.
      for (const call of mocks.brandKitFindFirst.mock.calls) {
        expect(call[0].where).toMatchObject({ isDefault: true, isDeleted: false })
        expect(call[0].where.teamId).toBeDefined()
      }
    })

    it('a team with NO default kit of its own gets null — never falls through to another team\'s', async () => {
      // Only team A has a default kit in this "database"; team B has none.
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { teamId: string } }) => {
        return where.teamId === TEAM_A ? kitA : null
      })

      const resolved = await resolveBrandKit(TEAM_B)
      expect(resolved).toBeNull()
    })
  })

  describe('website (039 D6)', () => {
    it('carries the kit website, and null when it has none', async () => {
      mocks.brandKitFindFirst.mockResolvedValue({ ...kitA, website: 'https://acme.example' })
      expect((await resolveBrandKit(TEAM_A))?.website).toBe('https://acme.example')
      mocks.brandKitFindFirst.mockResolvedValue({ ...kitA, website: null })
      expect((await resolveBrandKit(TEAM_A))?.website).toBeNull()
      mocks.brandKitFindFirst.mockResolvedValue(kitA)
      expect((await resolveBrandKit(TEAM_A))?.website).toBeNull()
    })
  })

  describe('explicit brief-kit tier', () => {
    it('scopes the explicit brandKitId lookup by teamId (defense-in-depth)', async () => {
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { id: string; teamId: string } }) => {
        return where.id === 'kit-a' && where.teamId === TEAM_A ? kitA : null
      })

      // Team B asking for team A's kit id must NOT resolve it.
      const resolved = await resolveBrandKit(TEAM_B, { brandKitId: 'kit-a' })
      expect(resolved).toBeNull()
      expect(mocks.brandKitFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'kit-a', teamId: TEAM_B }) }),
      )
    })
  })

  describe('project tier (038 D5)', () => {
    const kitP = { ...kitA, id: 'kit-p', name: 'Project kit', teamId: TEAM_A, isDeleted: false }
    const projects = { 'proj-a': { teamId: TEAM_A, defaultBrandKit: kitP } } as Record<
      string,
      { teamId: string; defaultBrandKit: typeof kitP }
    >
    beforeEach(() => {
      mocks.projectFindFirst.mockImplementation(async ({ where }: { where: { id: string; teamId: string } }) => {
        const p = projects[where.id]
        return p && p.teamId === where.teamId ? p : null
      })
    })

    it('an explicit kit wins over the project default', async () => {
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { id?: string; teamId: string } }) =>
        where.id === 'kit-a' && where.teamId === TEAM_A ? kitA : null,
      )
      const resolved = await resolveBrandKit(TEAM_A, { brandKitId: 'kit-a', projectId: 'proj-a' })
      expect(resolved?.id).toBe('kit-a')
      expect(resolved?.source).toBe('explicit')
      expect(mocks.projectFindFirst).not.toHaveBeenCalled()
    })

    it('with no explicit kit, the project default is used', async () => {
      mocks.brandKitFindFirst.mockResolvedValue(null)
      const resolved = await resolveBrandKit(TEAM_A, { projectId: 'proj-a' })
      expect(resolved?.id).toBe('kit-p')
      expect(resolved?.source).toBe('project')
    })

    it('with neither, the team default is used', async () => {
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { isDefault?: boolean; teamId: string } }) =>
        where.isDefault && where.teamId === TEAM_A ? kitA : null,
      )
      const resolved = await resolveBrandKit(TEAM_A, { projectId: 'proj-none' })
      expect(resolved?.id).toBe('kit-a')
      expect(resolved?.source).toBe('team')
    })

    it('a deleted project kit is skipped and falls to the team default', async () => {
      projects['proj-d'] = { teamId: TEAM_A, defaultBrandKit: { ...kitP, isDeleted: true } }
      mocks.brandKitFindFirst.mockImplementation(async ({ where }: { where: { isDefault?: boolean; teamId: string } }) =>
        where.isDefault && where.teamId === TEAM_A ? kitA : null,
      )
      expect((await resolveBrandKit(TEAM_A, { projectId: 'proj-d' }))?.source).toBe('team')
    })

    it('scopes the project lookup by teamId, so a foreign projectId resolves nothing', async () => {
      mocks.brandKitFindFirst.mockResolvedValue(null) // no default tier to fall through to
      const resolved = await resolveBrandKit(TEAM_B, { projectId: 'proj-a' })
      expect(resolved).toBeNull()
      expect(mocks.projectFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'proj-a', teamId: TEAM_B }) }),
      )
    })

    it('a project kit that belongs to another team is never returned', async () => {
      projects['proj-x'] = { teamId: TEAM_A, defaultBrandKit: { ...kitP, teamId: TEAM_B } }
      mocks.brandKitFindFirst.mockResolvedValue(null)
      expect(await resolveBrandKit(TEAM_A, { projectId: 'proj-x' })).toBeNull()
    })
  })
})
