// Caption-generation prompt builder shared by all copy providers (Anthropic,
// OpenAI, Claude CLI). Brand identity comes from the resolved brand kit —
// never hardcoded — so per-brief kit selection affects caption tone too.
//
// One call writes every requested target: a caption per channel plus,
// optionally, the on-image headline. The per-channel briefs, length guidance and
// key list all come from the CAPTION_REGISTRY, never written here. The
// reply is extracted by extractCaptionReply (src/lib/captions/extract.ts), which
// is why the prompt asks for one JSON object with exactly these keys.

import type { BriefInput } from '@/providers/interfaces/CopyProvider'
import { CAPTION_REGISTRY, captionSpec, type CaptionTarget } from '@/lib/channels'
import { rulesPromptText } from '@/lib/captions/rules'
import { captionReplyKeys } from '@/lib/captions/extract'
import { HEADLINE_MAX } from '@/lib/captions/headline'
import { derivedPromptVersion } from '@/lib/postStyles'

// Bump when caption prompt content changes materially; logged with every
// caption call. Separate from PROMPT_VERSION, which versions the design prompts.
// 2026-10-25.1: post styles (027): derived from the post-style dataset, like
// PROMPT_VERSION, and the user prompt carries the style's caption rules.
// 2026-11-02.1: the general caption and each target's rules rendered from the registry (039).
export const CAPTION_PROMPT_VERSION_BASE = '2026-11-02.1'
export const CAPTION_PROMPT_VERSION = derivedPromptVersion(CAPTION_PROMPT_VERSION_BASE)

// Room for the requested targets, including non-Latin scripts at about one
// token per character: 512 of overhead, plus the headline's cap and each
// caption's hard limit (039 D18, so the budget follows the registry).
export function captionMaxTokens(targets: readonly CaptionTarget[]): number {
  return targets.reduce(
    (sum, t) => sum + (t === 'HEADLINE' ? HEADLINE_MAX : captionSpec(t).hardLimit),
    512,
  )
}

export interface CaptionPrompt {
  system: string
  user: string
}

const count = (n: number) => n.toLocaleString('en-US')

function systemPrompt(brief: BriefInput, task: string): string {
  const brandName = brief.brandName ?? 'the brand'
  const voiceSection = brief.brandVoice
    ? `\n\nBrand voice guidelines:\n${brief.brandVoice}`
    : ''
  const briefingSection = brief.projectBriefing
    ? `\n\nProject briefing (applies to every post in this project):\n${brief.projectBriefing}`
    : ''
  return `You are an expert social media copywriter for ${brandName}. ${task}${voiceSection}${briefingSection}`
}

export function buildCaptionPrompt(brief: BriefInput, targets: readonly CaptionTarget[]): CaptionPrompt {
  const specs = CAPTION_REGISTRY.filter((s) => targets.includes(s.target))

  const bullets: string[] = []
  if (targets.includes('HEADLINE')) {
    bullets.push(
      `- "headline": the short line printed on the post image: one line, at most ${HEADLINE_MAX} characters, no hashtags, no emoji, no markdown.`
    )
  }
  // 039 D18: each entry's brief, its hard limit and its rules (rulesPromptText).
  for (const s of specs) {
    const rules = rulesPromptText(s, { hasWebsite: false })
    bullets.push(
      `- "${s.jsonKey}" (${s.label}): ${s.brief} At most ${count(s.hardLimit)} characters.${rules ? ` ${rules}` : ''}`,
    )
  }

  // 027 FR-09: the post style's caption rules, after Tone and before the task.
  const rulesBlock = brief.captionRules ? `

${brief.captionRules}` : ''

  const keys = captionReplyKeys(targets)
    .map((k) => `"${k}"`)
    .join(', ')
  const generalOnly = specs.length > 0 && specs.every((s) => s.kind === 'GENERAL')
  const labels = specs.map((s) => s.label).join(', ')
  const task = generalOnly
    ? 'Write the general caption for the post: compelling, on-brand and platform-neutral.'
    : `Write compelling, on-brand captions${labels ? ` for ${labels}` : ''}, each tailored to its channel.`

  return {
    system: systemPrompt(brief, task),
    user: `Topic: ${brief.topic}
Description: ${brief.description}
Goal: ${brief.goal}
Tone: ${brief.tone}${rulesBlock}

Write the following for the brief above:
${bullets.join('\n')}

Reply with exactly one JSON object whose keys are exactly ${keys}, each a string. No other keys. Escape newlines as \\n. The reply must contain that JSON object and nothing else: no preamble, no explanation, no code fences.`,
  }
}
