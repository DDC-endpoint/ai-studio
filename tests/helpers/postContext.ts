// A hand-built PostContext for unit tests (038 D6). The brand is private to
// src/lib/projects/context.ts, so a test that cannot reach the database builds
// one here. `src/` must never do this (tests/unit/postContextSites.test.ts scans it).
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import type { PostContext } from '@/lib/projects/context'

export function ctxFor(
  kit: ResolvedBrandKit | null,
  briefing: string | null = null,
  teamId = 'team-1',
  docs: string[] = [],
): PostContext {
  return {
    teamId,
    inputs: {
      v: 1,
      projectId: briefing === null ? null : 'project-1',
      briefingId: briefing === null ? null : 'briefing-1',
      briefingVersion: briefing === null ? null : 1,
      kitId: kit?.id ?? null,
      kitSource: kit ? 'team' : null,
    },
    project: briefing === null ? null : { id: 'project-1', name: 'Project' },
    kit,
    briefing: briefing === null ? null : { id: 'briefing-1', version: 1, content: briefing },
    documentTexts: async () => docs,
  } as unknown as PostContext
}
