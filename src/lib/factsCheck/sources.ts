// The facts check's source loader (027 FR-11, assumptions A3). Its sources come
// from the post's project context (038 D6): the brief's topic and description,
// the recorded project briefing, the resolved brand kit's voice prompt, and the
// parsed text of the recorded project's documents (the user's own words; they
// never enter generation prompts, but a stated fact can live only there).
// Brand-kit documents and artifacts are not sources.
import type { PostContext } from '@/lib/projects/context'
import { MAX_SOURCES_CHARS } from './types'

export interface FactsBrief {
  teamId: string
  topic: string
  description?: string | null
  brandKitId?: string | null
}

/**
 * The source strings for a brief, nulls dropped, cut at 200 000 characters in
 * total. The briefing and the kit voice come from the context the caller
 * already holds, so they are not read twice; only the documents are read here.
 */
export async function loadFactsSources(brief: FactsBrief, ctx: PostContext): Promise<string[]> {
  const docs = await ctx.documentTexts()
  const all = [brief.topic, brief.description, ctx.briefing?.content, ctx.kit?.voicePrompt, ...docs]
  const out: string[] = []
  let budget = MAX_SOURCES_CHARS
  for (const s of all) {
    if (typeof s !== 'string' || s.length === 0) continue
    if (budget <= 0) break
    const part = s.slice(0, budget)
    out.push(part)
    budget -= part.length
  }
  return out
}
