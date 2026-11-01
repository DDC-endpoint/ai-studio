// The brand kit's website (039 D6). It is user input that code inserts into a
// Facebook caption, so only an https URL is accepted. Pure: nothing fetches it,
// so it adds no SSRF surface.

export const KIT_WEBSITE_MAX = 2048
export const KIT_WEBSITE_ERROR = 'website must be an https URL'

export type ParsedKitWebsite = { ok: true; website: string } | { ok: false; error: string }

// The value is kept as typed after the trim, so code inserts the exact link.
export function parseKitWebsite(input: unknown): ParsedKitWebsite {
  const refuse = { ok: false, error: KIT_WEBSITE_ERROR } as const
  if (typeof input !== 'string') return refuse
  const value = input.trim()
  if (value === '' || value.length > KIT_WEBSITE_MAX || /\s/.test(value)) return refuse
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return refuse
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || !url.hostname.includes('.')) {
    return refuse
  }
  return { ok: true, website: value }
}
