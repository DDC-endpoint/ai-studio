// 039 FR-04, D8, D9, D17: the registry's rules as code (pure).
import { describe, it, expect } from 'vitest'
import { captionSpec } from '@/lib/channels'
import type { CaptionSpec } from '@/lib/channels'
import {
  checkCaptionRules,
  composeFacebookCaption,
  countHashtags,
  countWords,
  findLinks,
  ruleMissText,
  rulesPromptText,
} from '@/lib/captions/rules'

// The real Facebook entry (039 T4): 40 to 120 words, 0 to 3 hashtags, the kit website.
const FACEBOOK: CaptionSpec = captionSpec('FACEBOOK')
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const NO_SITE = { website: null }

describe('counting', () => {
  it('words are tokens with a letter or digit, not counting hashtags and links', () => {
    expect(countWords('Hello world #tag https://x.example/a www.y.example - 42')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('  \n ')).toBe(0)
  })

  it('a hashtag is # then letters, digits or _ at the start or after whitespace', () => {
    expect(countHashtags('#a b #c_d e#f x#y #3')).toBe(3)
    expect(countHashtags('no tags')).toBe(0)
    expect(countHashtags('#ශ්රී #naïve')).toBe(2)
  })

  it('a link is http(s):// or www. up to whitespace', () => {
    expect(findLinks('see https://a.example/x?y=1 and www.b.example, ok')).toEqual([
      'https://a.example/x?y=1',
      'www.b.example,',
    ])
    expect(findLinks('nothing here')).toEqual([])
  })
})

describe('checkCaptionRules', () => {
  it('the general caption takes no hashtags', () => {
    const g = captionSpec('GENERAL')
    expect(checkCaptionRules(g, 'Plain text.', NO_SITE)).toEqual({ met: true, unmet: [] })
    expect(checkCaptionRules(g, 'Text #tag', NO_SITE)).toEqual({ met: false, unmet: ['hashtags-over'] })
  })

  it('Instagram: hashtags must all sit on the last line', () => {
    const ig = captionSpec('INSTAGRAM')
    expect(checkCaptionRules(ig, 'Hook\n\nBody\n#a #b', NO_SITE).met).toBe(true)
    expect(checkCaptionRules(ig, 'Hook #a\n\nBody\n#b', NO_SITE).unmet).toEqual(['hashtags-not-at-end'])
    expect(checkCaptionRules(ig, 'Hook\n#a #b\n\n', NO_SITE).met).toBe(true)
  })

  it('LinkedIn: at most 3 hashtags', () => {
    const li = captionSpec('LINKEDIN')
    expect(checkCaptionRules(li, 'x #a #b #c', NO_SITE).met).toBe(true)
    expect(checkCaptionRules(li, 'x #a #b #c #d', NO_SITE).unmet).toEqual(['hashtags-over'])
  })

  it('a words range: under and over', () => {
    expect(checkCaptionRules(FACEBOOK, words(39), NO_SITE).unmet).toEqual(['words-under'])
    expect(checkCaptionRules(FACEBOOK, words(40), NO_SITE).met).toBe(true)
    expect(checkCaptionRules(FACEBOOK, words(120), NO_SITE).met).toBe(true)
    expect(checkCaptionRules(FACEBOOK, words(121), NO_SITE).unmet).toEqual(['words-over'])
  })

  it('Facebook: more than 3 hashtags is hashtags-over (039 AC-18)', () => {
    expect(checkCaptionRules(FACEBOOK, `${words(50)} #a #b #c`, NO_SITE).met).toBe(true)
    expect(checkCaptionRules(FACEBOOK, `${words(50)} #a #b #c #d`, NO_SITE).unmet).toEqual(['hashtags-over'])
  })

  it('link-missing only when a website is set and the text lacks it', () => {
    const site = 'https://acme.example'
    expect(checkCaptionRules(FACEBOOK, words(50), { website: site }).unmet).toEqual(['link-missing'])
    expect(checkCaptionRules(FACEBOOK, `${words(50)}\n${site}`, { website: site }).met).toBe(true)
    expect(checkCaptionRules(FACEBOOK, words(50), NO_SITE).met).toBe(true)
  })
})

describe('composeFacebookCaption (D17: the link is code, never the model)', () => {
  const site = 'https://acme.example'

  it('puts the link before a closing hashtag line', () => {
    expect(composeFacebookCaption('Body.\nBook today.\n#a #b', site)).toBe(
      'Body.\nBook today.\nhttps://acme.example\n\n#a #b',
    )
  })

  it('with no hashtag line, the link is last', () => {
    expect(composeFacebookCaption('Body.\nBook today.', site)).toBe('Body.\nBook today.\nhttps://acme.example')
  })

  it('with no website, the body is unchanged', () => {
    expect(composeFacebookCaption('Body.\n#a', null)).toBe('Body.\n#a')
  })

  it('a hashtag inside the body does not move the link', () => {
    expect(composeFacebookCaption('Body #a here.\nEnd.', site)).toBe('Body #a here.\nEnd.\nhttps://acme.example')
  })
})

describe('the prompt text and the notices read the same rules', () => {
  it('rulesPromptText states words, hashtags and the link rule', () => {
    const text = rulesPromptText(FACEBOOK, { hasWebsite: true })
    expect(text).toContain('40 to 120 words')
    expect(text).toContain('At most 3 hashtags')
    expect(text).toContain('Do not write any URL, domain or link placeholder')
    expect(rulesPromptText(FACEBOOK, { hasWebsite: false })).toContain('Do not write any URL or domain.')
    expect(rulesPromptText(captionSpec('GENERAL'), { hasWebsite: false })).toContain('No hashtags.')
    expect(rulesPromptText(captionSpec('INSTAGRAM'), { hasWebsite: false })).toContain('last line')
  })

  it('ruleMissText names the miss and the count', () => {
    expect(ruleMissText(FACEBOOK, 'words-over', words(131), null)).toBe('Facebook asks for 40 to 120 words. This has 131.')
    expect(ruleMissText(captionSpec('GENERAL'), 'hashtags-over', 'x #a', null)).toBe('General takes no hashtags. This has 1.')
    expect(ruleMissText(captionSpec('LINKEDIN'), 'hashtags-over', '#a #b #c #d', null)).toBe(
      'LinkedIn allows at most 3 hashtags. This has 4.',
    )
    expect(ruleMissText(FACEBOOK, 'link-missing', '', 'https://acme.example')).toContain('https://acme.example')
    expect(ruleMissText(FACEBOOK, 'link-missing', '', null)).toMatch(/website/)
  })
})
