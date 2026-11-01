// 039 D19, AC-16: the facts check's sources are never a caption. A value the model
// invented in the general caption must not become a "source" for a curated one,
// so the sources module takes only the brief, the briefing, the voice and the
// documents, and imports nothing from the captions module.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFactsSources } from '@/lib/factsCheck/sources'

const SOURCES = 'src/lib/factsCheck/sources.ts'
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// What a sources module must not reach: anything from @/lib/captions (a relative
// path into it included), or a read of the caption table.
export function importsCaptions(source: string): boolean {
  const stripped = code(source)
  return (
    /from\s+['"]@\/lib\/captions(?:\/[^'"]*)?['"]/.test(stripped) ||
    /from\s+['"](?:\.\.?\/)+captions(?:\/[^'"]*)?['"]/.test(stripped) ||
    /\bdraftCaption\b/.test(stripped)
  )
}

describe('the facts sources are never a caption (AC-16)', () => {
  it('loadFactsSources returns only the topic, description, briefing, voice and documents of its inputs', async () => {
    const ctx = {
      briefing: { content: 'BRIEFING' },
      kit: { voicePrompt: 'VOICE' },
      documentTexts: async () => ['DOC1', 'DOC2'],
    }
    const out = await loadFactsSources(
      { teamId: 't', topic: 'TOPIC', description: 'DESC' },
      ctx as unknown as Parameters<typeof loadFactsSources>[1],
    )
    expect(out).toEqual(['TOPIC', 'DESC', 'BRIEFING', 'VOICE', 'DOC1', 'DOC2'])
  })

  it('src/lib/factsCheck/sources.ts has no import from @/lib/captions', () => {
    expect(importsCaptions(readFileSync(join(process.cwd(), SOURCES), 'utf8'))).toBe(false)
  })

  it('a fixture importing loadDraftCaptions from the captions store fails (AC-16 fixture)', () => {
    const fixture = [
      "import { loadDraftCaptions } from '@/lib/captions/store'",
      "import type { PostContext } from '@/lib/projects/context'",
      'export async function loadFactsSources() { return await loadDraftCaptions("d") }',
    ].join('\n')
    expect(importsCaptions(fixture)).toBe(true)
  })

  it('catches the other ways in: a relative import and a table read, but not a comment that mentions one', () => {
    expect(importsCaptions("import { x } from '../captions/store'")).toBe(true)
    expect(importsCaptions("import { y } from '@/lib/captions'")).toBe(true)
    expect(importsCaptions('const rows = await prisma.draftCaption.findMany({})')).toBe(true)
    expect(importsCaptions("// import { loadDraftCaptions } from '@/lib/captions/store'\nexport const a = 1")).toBe(false)
  })
})
