// The registry's caption rules as code (039 D8, D9, D17): the prompt lines, the
// check, and the Facebook link composer. Pure and client-safe: the draft page
// reads the same check the server does, and nothing here is stored (an edit
// clears a miss at once).

import { captionSpec, type CaptionSpec, type CaptionTarget } from '@/lib/channels'

export type RuleMiss = 'words-under' | 'words-over' | 'hashtags-over' | 'hashtags-not-at-end' | 'link-missing'

// 039 D17: shown under "Curate for Facebook" and on the Facebook card when the
// post's brand kit has no website.
export const NO_WEBSITE_NOTICE =
  'This brand kit has no website, so the call to action has no link. A team admin can add one in Brand kits.'

// A hashtag is # then letters, digits or _, at the start or after whitespace.
export const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
// A link is http(s):// or www. up to whitespace.
export const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi

const HASHTAG_TOKEN = /^#[\p{L}\p{N}_]+$/u

export function findLinks(text: string): string[] {
  return text.match(LINK) ?? []
}

export function countHashtags(text: string): number {
  return (text.match(HASHTAG) ?? []).length
}

// Whitespace-separated tokens that hold a letter or a digit, not counting
// hashtags and links.
export function countWords(text: string): number {
  const bare = text.replace(LINK, ' ').replace(HASHTAG, '$1')
  return bare.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length
}

const lastNonEmptyIndex = (lines: string[]): number => {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim() !== '') return i
  return -1
}

export function checkCaptionRules(
  spec: CaptionSpec,
  text: string,
  ctx: { website: string | null },
): { met: boolean; unmet: RuleMiss[] } {
  const { rules } = spec
  const unmet: RuleMiss[] = []
  if (rules.words) {
    const words = countWords(text)
    if (words < rules.words.min) unmet.push('words-under')
    if (words > rules.words.max) unmet.push('words-over')
  }
  if (countHashtags(text) > rules.hashtags.max) unmet.push('hashtags-over')
  if (rules.hashtagsAtEnd) {
    const lines = text.split('\n')
    const last = lastNonEmptyIndex(lines)
    if (lines.some((line, i) => i !== last && countHashtags(line) > 0)) unmet.push('hashtags-not-at-end')
  }
  if (rules.link === 'kit-website' && ctx.website && !text.includes(ctx.website)) unmet.push('link-missing')
  return { met: unmet.length === 0, unmet }
}

// The registry's rules as prompt lines.
export function rulesPromptText(spec: CaptionSpec, ctx: { hasWebsite: boolean }): string {
  const { rules } = spec
  const lines: string[] = []
  if (rules.words) lines.push(`${rules.words.min} to ${rules.words.max} words.`)
  if (rules.hashtags.max === 0) lines.push('No hashtags.')
  else lines.push(`${rules.hashtags.min === 0 ? 'At most' : `${rules.hashtags.min} to`} ${rules.hashtags.max} hashtags.`)
  if (rules.hashtagsAtEnd) lines.push('Put every hashtag on the last line.')
  if (rules.link === 'kit-website') {
    lines.push(
      ctx.hasWebsite
        ? 'End with one call to action sentence that sends readers to the website. The app adds the link after it. Do not write any URL, domain or link placeholder.'
        : 'End with one call to action sentence. Do not write any URL or domain.',
    )
  }
  return lines.join(' ')
}

// One stored caption's rules state, for the draft GET and MCP/ACP (039 FR-15,
// D20): checked on a READY, live row that has text; any other row has nothing to
// check.
export function captionRulesFor(
  row: { target: Exclude<CaptionTarget, 'HEADLINE'>; status: string; text: string; deleted: boolean },
  website: string | null,
): { met: boolean; unmet: RuleMiss[] } {
  if (row.status !== 'READY' || !row.text || row.deleted) return { met: true, unmet: [] }
  return checkCaptionRules(captionSpec(row.target), row.text, { website })
}

// Places the kit's website after the body and before a closing hashtag line, so
// the link is code's, never the model's, and never trusts the body's layout.
// With no website the body is returned unchanged.
export function composeFacebookCaption(body: string, website: string | null): string {
  if (!website) return body
  const lines = body.trim().split('\n')
  const last = lastNonEmptyIndex(lines)
  const lastTokens = last >= 0 ? lines[last].trim().split(/\s+/) : []
  const hashtagLine = last >= 0 && lastTokens.every((t) => HASHTAG_TOKEN.test(t)) ? lines[last].trim() : null
  const rest = (hashtagLine === null ? lines : lines.slice(0, last)).join('\n').trimEnd()
  return `${rest}\n${website}${hashtagLine === null ? '' : `\n\n${hashtagLine}`}`
}

// The one-line notice for an unmet rule, e.g. "Facebook asks for 40 to 120 words. This has 131."
export function ruleMissText(spec: CaptionSpec, miss: RuleMiss, text: string, website: string | null): string {
  const { rules } = spec
  switch (miss) {
    case 'words-under':
    case 'words-over':
      return `${spec.label} asks for ${rules.words?.min} to ${rules.words?.max} words. This has ${countWords(text)}.`
    case 'hashtags-over':
      return rules.hashtags.max === 0
        ? `${spec.label} takes no hashtags. This has ${countHashtags(text)}.`
        : `${spec.label} allows at most ${rules.hashtags.max} hashtags. This has ${countHashtags(text)}.`
    case 'hashtags-not-at-end':
      return `${spec.label} wants every hashtag on the last line.`
    case 'link-missing':
      return website
        ? `The call to action does not carry the brand kit's website, ${website}.`
        : "The call to action does not carry the brand kit's website."
  }
}
