// 039 D21 / FR-17 / AC-07: `Brief.channels` is deprecated. Nothing in src/ reads
// it and nothing writes it; the column stays (no migration) with a comment that
// says so. The guard fails on a read (`brief.channels`) and on a write (a
// `channels` key inside a `brief.create` call).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// A read: `brief.channels` or `brief?.channels` (so `draft.brief.channels` too).
const READ = /\bbrief\??\.channels\b/

/** The text inside each `brief.create(...)` call, parentheses balanced. */
function briefCreateCalls(code: string): string[] {
  const calls: string[] = []
  const start = /\bbrief\s*\.\s*create\s*\(/g
  for (let m = start.exec(code); m; m = start.exec(code)) {
    let depth = 1
    let i = start.lastIndex
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++
      else if (code[i] === ')') depth--
      i++
    }
    calls.push(code.slice(start.lastIndex, i - 1))
  }
  return calls
}

// A write: a `channels` key (`channels:`, shorthand `channels,` or `channels }`)
// inside a `brief.create` call.
const WRITE_KEY = /\bchannels\b\s*[:,}]/

/** The ways a source breaks the deprecation: a read, or a write in brief.create. */
export function channelsUses(source: string): string[] {
  const code = stripComments(source)
  const uses: string[] = []
  if (READ.test(code)) uses.push('read')
  if (briefCreateCalls(code).some((call) => WRITE_KEY.test(call))) uses.push('write')
  return uses
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

describe('Brief.channels is deprecated (039 D21, AC-07)', () => {
  it('no file under src/ reads brief.channels or writes channels in a brief.create call', () => {
    const offenders = walk(join(root, 'src'))
      .map((p) => ({ p: relative(root, p).split(sep).join('/'), uses: channelsUses(readFileSync(p, 'utf8')) }))
      .filter((f) => f.uses.length > 0)
    expect(offenders).toEqual([])
  })

  // AC-07's failing fixtures: the guard must fail on each, or it guards nothing.
  it('a fixture `draft.brief.channels.map(channelLabel)` fails (a read)', () => {
    const fixture = `const label = draft.brief.channels.map(channelLabel).join(', ')`
    expect(channelsUses(fixture)).toEqual(['read'])
  })

  it('a fixture `prisma.brief.create({ data: { channels } })` fails (a write)', () => {
    const fixture = `await prisma.brief.create({ data: { topic, channels } })`
    expect(channelsUses(fixture)).toEqual(['write'])
    const keyed = `await prisma.brief.create({ data: { topic, channels: normalized } })`
    expect(channelsUses(keyed)).toEqual(['write'])
  })

  it('a channels key outside a brief.create call, and a mention in a comment, is not a use', () => {
    expect(channelsUses(`const x = { channels: [] }`)).toEqual([])
    expect(channelsUses(`// brief.channels is deprecated\nawait prisma.brief.create({ data: { topic } })`)).toEqual([])
    expect(channelsUses(`await prisma.draft.create({ data: { channels } })`)).toEqual([])
  })

  it('a call after another call is read on its own: a clean create next to a channels write still fails', () => {
    const fixture = [
      'await prisma.brief.create({ data: { topic } })',
      'await prisma.brief.create({ data: { topic, channels } })',
    ].join('\n')
    expect(channelsUses(fixture)).toEqual(['write'])
  })

  it('schema.prisma keeps the column with the deprecation comment', () => {
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/\/\/\/ Deprecated \(039\): ignored; no writer or reader\. Never reuse\.\s*\n\s*channels\s+Channel\[\]/)
  })

  it('POST /api/briefs and generate_post ignore the key: the validators no longer name channels', () => {
    for (const file of ['src/app/api/briefs/route.ts', 'src/mcp/tools/generate.ts', 'src/app/api/acp/run/route.ts']) {
      const code = stripComments(readFileSync(join(root, file), 'utf8'))
      expect(code, file).not.toMatch(/channels must be|channels entries must/)
      expect(code, file).not.toMatch(/\bbody\.channels\b|\binput\.channels\b|\bargs\.channels\b/)
    }
  })
})
