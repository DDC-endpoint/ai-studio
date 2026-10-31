import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// AC-14 (011 FR-13): the Frozen Light layer stays gone. Every .ts/.tsx/.css
// file under src/ is checked against the three patterns of 011 design.md §7
// (legacy light-*/dark-* colour utilities, the glass utilities, raw Tailwind
// palette colours) plus the removed GlassInput/GlassPanel names. A line that
// carries `ui-exception:` is skipped, which covers both `// ui-exception: …`
// and the JSX form `{/* ui-exception: … */}` (DESIGN_SYSTEM.md §11).
//
// 014 FR-11 adds four tokens to that guard, matched as whole class tokens:
// glow-blob, animate-scale-in, font-inter and the legacy primary colour family
// (text-primary, hover:bg-primary-light, text-primary/50, …). 018 FR-07 widens
// the family to digit-suffixed shades (text-primary-500, bg-primary-600/20).
//
// 014 FR-05: the shared atoms and page primitives are defined once, in
// src/components/ui/. Any other file under src/ that declares one of their
// names is a new copy and fails here (014 design.md §5). A copy has no
// legitimate exception, so `ui-exception:` does not apply to this guard. 014's
// small-caps-literal check (`tracking-[0.14em]` outside ui/) is superseded by
// the deny-list's pattern 5, which bans every positive arbitrary tracking,
// ui/ included (021 design.md §6).
//
// 032 FR-14: the design system is Folio again. The Folio deny-list (021
// FR-13) is gone; its replacement is GRAPHITE_DENY below, the Tailwind keys,
// the font and the logo that only the 021 Graphite config had. The one rule
// kept from 021's module rule: no file imports a path ending in `/folio`, and
// no module is named `folio` (the helpers are `atoms.ts` and each feature's
// `classes.ts`). A file that a change after 021 touched and that is not yet
// restyled is named in PENDING_RESTYLE (032 W3 empties it).

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')

// 014 FR-11: a whole class token starts at the start of the line or after one
// of \s " ' ` { ( : (so a variant such as `hover:text-primary` is caught), and
// ends at the end of the line or before one of \s " ' ` } ) ] / (so an
// opacity such as `text-primary/50` is caught) or , . ; : — the punctuation
// that follows a token in a comment, since comments are scanned like code
// (the old Modal comment read "NOT animate-scale-in: the keyframes …").
// `my-glow-blob-x`, `xtext-primary` and `animate-scale-in-out` are other
// tokens and pass.
const START = String.raw`(?:^|(?<=[\s"'\`{(:!]))`
const END = String.raw`(?=$|[\s"'\`})\]/,.;:])`

const PATTERNS: Array<[string, RegExp]> = [
  [
    'legacy light-/dark- colour utility',
    /(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+/,
  ],
  ['glass utility', /\bglass(-panel|-popover|-input)?\b/],
  [
    'raw palette colour',
    /(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}/,
  ],
  ['removed Glass primitive', /GlassInput|GlassPanel/],
  // 014 FR-11, matched as whole class tokens (design.md §5).
  ['glow blob', new RegExp(`${START}glow-blob${END}`)],
  ['scale-in animation', new RegExp(`${START}animate-scale-in${END}`)],
  ['Inter font', new RegExp(`${START}font-inter${END}`)],
  [
    'legacy primary colour',
    new RegExp(
      `${START}(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary(?:-[a-z0-9]+)*${END}`
    ),
  ],
]

// 032 FR-14 / design §4.3. The Tailwind keys 021 added and Folio does not have,
// the Graphite font, and the PNG logo. Derived by diffing the two configs. The
// scope is src/app/**, src/components/** and tailwind.config.ts, including
// atoms.ts and every classes.ts. Out of scope: post font data
// (src/lib/fonts/catalogue.json, which this guard never reads).
// `codeOnly` entries ignore comments, so prose such as "1/12 of the rows" does
// not fire; the others match anywhere. There is no legitimate Graphite
// leftover, so `ui-exception:` does not apply.
const GRAPHITE_DENY: Array<{ label: string; re: RegExp; codeOnly?: true }> = [
  { label: 'Graphite radius ui-xl', re: /\brounded-ui-xl\b/ },
  { label: 'Graphite tracking-label', re: /\btracking-label\b/ },
  // the 021 status-tint alpha, on colour utilities only (a w-1/12 fraction is fine)
  {
    label: 'Graphite opacity 12',
    re: /\b(?:[\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|to|via|shadow|divide|outline|decoration|placeholder|accent|caret)-[\w-]+\/12\b/,
    codeOnly: true,
  },
  { label: 'Graphite font family', re: /Plus Jakarta/ },
  { label: 'PNG logo', re: /BistecStudioLogo/ },
]

// Repo-relative files that a change after 021 touched and that W3 has not
// restyled yet (032 design §2.2). Each is exempt from GRAPHITE_DENY and from
// the shared-name guard until its W3 task removes it. W3's last task sets
// W3_DONE and the list must then be empty.
const W3_DONE = true
const PENDING_RESTYLE: readonly string[] = []

const SHARED_NAME =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:const|let|function)\s+(FOCUS|SCROLL_FOCUS|SMALL_CAPS|EYEBROW|FIELD_LABEL|PAGE_TITLE|PAGE_LEAD|SECTION_HEAD|SECTION_NUMERAL|SUB_HEAD|KIT_TITLE|STEP_HEAD|STEP_NUMERAL|STEP_LEAD|GROUP_HEAD|ASIDE_HEAD|NOTICE|WARN_NOTICE|ICON|ICON_SM|ICON_BUTTON|TEXT_LINK|TAG|TABLE_HEAD_ROW|ROW|COMPACT_FIELD|COMPACT_TEXTAREA|PILL_BADGE|PageHead|PageTitle|SectionHead|SectionHeader|Notice|FieldLabel|StatusWord|GateNotice)\b/
const UI_DIR = 'src/components/ui/'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : []
  })
}

function findViolations(file: string, text: string): string[] {
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('ui-exception:')) return
    for (const [label, re] of PATTERNS) {
      const m = line.match(re)
      if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
    }
  })
  return hits
}

// FR-05. `file` is the repo-relative path with forward slashes.
function findSharedCopies(file: string, text: string, pending: readonly string[] = PENDING_RESTYLE): string[] {
  if (file.startsWith(UI_DIR) || pending.includes(file)) return []
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const name = line.match(SHARED_NAME)
    if (name) hits.push(`${file}:${i + 1}: ${name[1]} (shared name outside ${UI_DIR})`)
  })
  return hits
}

describe('UI token guard (AC-14)', () => {
  const files = sourceFiles(SRC)

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true)
  })

  it('finds no legacy colour utility, glass class, raw palette colour or Glass primitive in src/', () => {
    const hits = files.flatMap((f) =>
      findViolations(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern, and honours ui-exception in both comment forms', () => {
    const sample = [
      '<div className="bg-light-surface">', // 1
      '<div className="glass-panel">', // 2
      '<p className="text-slate-500">', // 3
      "import { GlassInput } from '@/components/ui'", // 4
      '<div className="bg-white" /> // ui-exception: post frame', // 5
      '<p>{/* ui-exception: swatch */}<span className="text-sky-500" /></p>', // 6
      '<div className="bg-surface text-fg">', // 7
    ].join('\n')
    const hits = findViolations('sample.tsx', sample)
    expect(hits.map((h) => h.split(':')[1])).toEqual(['1', '2', '3', '4'])
  })

  // 014 AC-10: each FR-11 token is flagged as a whole class token, wherever a
  // variant or an opacity puts it, and only there.
  it.each([
    ['<div className="glow-blob" />', 'glow-blob'],
    ["cn('animate-scale-in', open && 'block')", 'animate-scale-in'],
    // The Modal comment before 014 T12: comments are scanned, punctuation ends a token.
    ['// animate-modal-in, NOT animate-scale-in: the keyframes must carry', 'animate-scale-in'],
    ['<p className="md:animate-scale-in">', 'animate-scale-in'],
    ['<p className="font-inter text-fg">', 'font-inter'],
    ['<p className="text-primary">', 'text-primary'],
    ['<a className="text-fg hover:text-primary">', 'text-primary'],
    ['<span className="text-primary/50">', 'text-primary'],
    ['<div className={`bg-primary-light ${x}`}>', 'bg-primary-light'],
    ['<svg className="[&_path]:fill-primary">', 'fill-primary'],
    // 018 FR-07: the digit-suffixed shades of the legacy family.
    ['<p className="text-primary-500">', 'text-primary-500'],
    ['<div className="hover:bg-primary-600/20">', 'bg-primary-600'],
  ])('flags %s', (line, token) => {
    const hits = findViolations('sample.tsx', line)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(`: ${token} (`)
  })

  it.each([
    '<Button variant="primary">',
    '<div className="my-glow-blob-x" />',
    '<p className="xtext-primary">',
    '<p className="xtext-primary-500">',
    '<p className="animate-scale-in-out font-interface">',
    '<p className="text-fg">Primary text</p>',
    '// animate-modal-in, not the old scale-in keyframe: the keyframes must carry',
    '<div className="text-primary" /> // ui-exception: self-test',
  ])('passes %s', (line) => {
    expect(findViolations('sample.tsx', line)).toEqual([])
  })
})

// Comments removed, line structure kept (so line numbers stay right): block
// comments, including JSX `{/* … */}`, and `//` comments that start a line or
// follow whitespace (so `http://x` passes).
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/[^\n]*/gm, '$1')
}

// 032 FR-14. `file` is the repo-relative path with forward slashes. A file in
// `pending` passes by its exact name, so a pending entry never hides a new rule.
function findGraphite(file: string, text: string, pending: readonly string[] = PENDING_RESTYLE): string[] {
  if (pending.includes(file)) return []
  const hits: string[] = []
  const code = stripComments(text).split(/\r?\n/)
  text.split(/\r?\n/).forEach((raw, i) => {
    for (const { label, re, codeOnly } of GRAPHITE_DENY) {
      const m = (codeOnly ? code[i] : raw).match(re)
      if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
    }
  })
  return hits
}

// The 021 module rule, kept: no import of a path that ends in `/folio`, and no
// module named after it (the helpers are atoms.ts and classes.ts).
const FOLIO_IMPORT = /from\s+['"][^'"]*\/folio(?:\.tsx?)?['"]/i
function findFolioModule(file: string, text: string): string[] {
  const hits: string[] = []
  const name = file.split('/').pop() ?? file
  if (/^folio\.(ts|tsx|css)$/i.test(name)) hits.push(`${file}: ${name} (module named folio)`)
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(FOLIO_IMPORT)
    if (m) hits.push(`${file}:${i + 1}: ${m[0]} (import of a folio module)`)
  })
  return hits
}

const repoPath = (f: string) => relative(ROOT, f).split('\\').join('/')
const inGraphiteScope = (file: string) =>
  file === 'tailwind.config.ts' || file.startsWith('src/app/') || file.startsWith('src/components/')

describe('Graphite deny-list (032 FR-14, AC-16)', () => {
  const files = [...sourceFiles(SRC).map(repoPath), 'tailwind.config.ts'].filter(inGraphiteScope)
  const read = (file: string) => readFileSync(resolve(ROOT, file), 'utf8')
  // The files that fail with an empty exemption list: what PENDING_RESTYLE may
  // name, and no other.
  const failing = () =>
    files.filter((f) => findGraphite(f, read(f), []).length > 0 || findSharedCopies(f, read(f), []).length > 0)

  it('scans src/app, src/components and the Tailwind config, including atoms.ts and every classes.ts', () => {
    expect(files).toContain('tailwind.config.ts')
    expect(files).toContain('src/components/ui/atoms.ts')
    expect(files.filter((f) => f.endsWith('/classes.ts')).length).toBeGreaterThanOrEqual(2)
    expect(files).not.toContain('src/lib/fonts/catalogue.json')
  })

  it('finds no Graphite leftover in a file that is not pending a restyle', () => {
    const hits = files.flatMap((f) => findGraphite(f, read(f)))
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('finds no module named folio and no import of one', () => {
    const hits = sourceFiles(SRC).flatMap((f) => findFolioModule(repoPath(f), readFileSync(f, 'utf8')))
    expect(hits, hits.join('\n')).toEqual([])
  })

  it.each([
    ['<div className="rounded-ui-xl p-4">', 'rounded-ui-xl'],
    ["cn('md:rounded-ui-xl', open && 'block')", 'rounded-ui-xl'],
    ['<h2 className="text-ui-2xs tracking-label">', 'tracking-label'],
    ["export const SMALL_CAPS = 'text-ui-2xs tracking-label'", 'tracking-label'],
    ['<span className="bg-status-failed/12 text-status-failed">', 'bg-status-failed/12'],
    ['<span className="dark:bg-status-draft/12">', 'dark:bg-status-draft/12'],
    ['// the heading face is Plus Jakarta Sans', 'Plus Jakarta'],
    ["const face = 'Plus Jakarta Sans, sans-serif'", 'Plus Jakarta'],
    ['<img src="/BistecStudioLogo.png" alt="" />', 'BistecStudioLogo'],
    ["import logo from '@/../public/BistecStudioLogo.png'", 'BistecStudioLogo'],
  ])('flags %s', (line, token) => {
    const hits = findGraphite('src/components/x.tsx', line, [])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(`: ${token} (`)
  })

  it.each([
    '<div className="rounded-ui-lg rounded-ui-md">',
    '<h2 className="tracking-[-0.01em] tracking-tight">',
    '<div className="w-1/2 w-1/3 opacity-60 bg-status-failed/10 bg-scrim/50">',
    '<div className="w-1/12 col-span-5/12 basis-1/12">',
    '<div className="col-span-1 xrounded-ui-xl tracking-labels">',
    // the /12 pattern ignores comments: the prose of a comment is not a class
    '// the first 1/12 of the rows, and the status tint at 10/12 of the width',
    '/* a 5/12 split, was bg-status-failed/12 in Graphite */',
    '{/* the 1/12 case: a /12 in a JSX comment is skipped */}',
    "const url = 'http://example.test/a'",
  ])('passes %s', (line) => {
    expect(findGraphite('src/components/x.tsx', line, [])).toEqual([])
  })

  it('does not honour ui-exception', () => {
    expect(findGraphite('src/components/x.tsx', '<p className="rounded-ui-xl" /> // ui-exception: x', [])).toHaveLength(1)
  })

  it('exempts a file only by its exact repo-relative path', () => {
    const line = '<p className="rounded-ui-xl" />'
    expect(findGraphite('src/components/x.tsx', line, ['src/components/x.tsx'])).toEqual([])
    expect(findGraphite('src/components/y.tsx', line, ['src/components/x.tsx'])).toHaveLength(1)
  })

  it('flags a folio import and a module named folio, and passes the new modules', () => {
    expect(findFolioModule('src/components/x.tsx', "import { EYEBROW } from '@/components/ui/folio'")).toHaveLength(1)
    expect(findFolioModule('src/components/x.tsx', "import { ROW } from './folio'")).toHaveLength(1)
    expect(findFolioModule('src/components/ui/folio.ts', '')).toHaveLength(1)
    expect(findFolioModule('src/components/team/Folio.tsx', '')).toHaveLength(1)
    expect(findFolioModule('src/components/x.tsx', "import { ROW } from '@/components/ui/atoms'")).toEqual([])
    expect(findFolioModule('src/components/x.tsx', "import { ROW_TITLE } from '@/components/projects/classes'")).toEqual([])
    expect(findFolioModule('src/components/x.tsx', '// the Folio design system, see folio notes')).toEqual([])
  })

  // The exemption list is honest: a file that passes must be removed from it.
  it('PENDING_RESTYLE names only files that exist, are in scope and still fail', () => {
    const stillFailing = new Set(failing())
    for (const file of PENDING_RESTYLE) {
      expect(files, `${file} exists and is in scope`).toContain(file)
      expect(stillFailing.has(file), `${file} passes now: remove it from PENDING_RESTYLE`).toBe(true)
    }
    expect(new Set(PENDING_RESTYLE).size).toBe(PENDING_RESTYLE.length)
  })

  it('PENDING_RESTYLE is empty once W3 is done', () => {
    if (W3_DONE) expect(PENDING_RESTYLE).toEqual([])
  })
})

describe('Shared-name guard (014 FR-05, AC-02)', () => {
  const files = sourceFiles(SRC)

  it('finds no copy of a shared atom or primitive outside src/components/ui/', () => {
    const hits = files.flatMap((f) =>
      findSharedCopies(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern outside ui, ignores ui-exception, and passes the same lines inside ui', () => {
    const sample = [
      "export const EYEBROW = 'x'", // 1
      'const FOCUS =', // 2
      'export function SectionHead({ title }: Props) {', // 3
      '  function StatusWord() {', // 4
      '<span className="uppercase tracking-[0.14em]">', // 5: not a copy (the deny-list's patterns 5 and 6 catch it)
      "export const EYEBROW = 'x' // ui-exception: not honoured by this guard", // 6
      "const SHELL_ICON_BUTTON = 'x'", // 7: a different name
      'const ICON_SIZE = 15', // 8: a longer name
      "import { EYEBROW, SectionHead } from '@/components/ui/atoms'", // 9: a use, not a copy
      '<span className={`${EYEBROW} mb-3`}>', // 10
      '<th className="tracking-[0.1em]">', // 11: the same (pattern 5)
      "export const PILL_BADGE = 'x'", // 12 (021 T2)
      'export function GateNotice({ title }: Props) {', // 13 (021 T2)
      "const ROW = 'border-b py-3'", // 14 (021 T8)
      "export const ROW_TITLE = 'x'", // 15: a longer name (campaigns/classes.ts)
    ].join('\n')
    const lines = (hits: string[]) => hits.map((h) => h.split(':')[1])
    expect(lines(findSharedCopies('src/components/team/ApiKeysCard.tsx', sample))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '6',
      '12',
      '13',
      '14',
    ])
    expect(findSharedCopies('src/components/ui/atoms.ts', sample)).toEqual([])
  })
})
