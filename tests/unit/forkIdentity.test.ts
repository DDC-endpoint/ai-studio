/**
 * Fork identity guard (change 032, FR-02).
 *
 * This repo is the fork `DDC-endpoint/ai-studio`. It deploys nothing and holds no
 * company registry, Coolify or production-host reference. Each check below is a small pure
 * function, applied to the real files (must find nothing) and to an in-memory bad string
 * (must find something), so a check that silently stops matching fails here.
 *
 * Reads files with readFileSync/readdirSync only (no git), so it runs on CI's depth-1 checkout.
 * The names of the deleted docs are built from fragments so this file does not name them
 * (the "names a deleted doc" check would otherwise flag its own source).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Files under `rel` (recursive), as repo-relative posix paths. */
function walk(rel: string, skip: (relPath: string, isDir: boolean) => boolean = () => false): string[] {
  const abs = path.join(ROOT, rel)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const name of readdirSync(abs)) {
    const childRel = rel === '' ? name : `${rel}/${name}`
    const isDir = statSync(path.join(ROOT, childRel)).isDirectory()
    if (skip(childRel, isDir)) continue
    if (isDir) out.push(...walk(childRel, skip))
    else out.push(childRel)
  }
  return out
}

/** Drops full-line comments and trailing ` # ...` comments (YAML and shell). */
function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => l.replace(/\s#.*$/, ''))
    .join('\n')
}

// --- check 1: no company deploy identity ---------------------------------------------------

const COMPANY_PATTERNS: Array<[string, RegExp]> = [
  ['coolify', /coolify/i],
  ['ghcr.io/bistec-oss', /ghcr\.io\/bistec-oss/i],
  ['bistec-oss/studio', /bistec-oss\/studio/i],
  ['studio.bistecglobal.com', /studio\.bistecglobal\.com/i],
]

function companyReferences(text: string, patterns = COMPANY_PATTERNS): string[] {
  return patterns.filter(([, re]) => re.test(text)).map(([name]) => name)
}

/**
 * docker-entrypoint.sh keeps three comment lines that name Coolify. Change 032 AC-03 pins the
 * file byte for byte to its 59f3b222 content, so for that one file only the code is checked
 * (comments are dropped); the registry and host names are still caught in its comments.
 */
const SHELL_COMMENT_EXEMPT_FOR_COOLIFY = new Set(['docker-entrypoint.sh'])

function deployIdentityFiles(): string[] {
  const files = [
    ...walk('.github/workflows'),
    'Dockerfile',
    'docker-entrypoint.sh',
    ...readdirSync(ROOT).filter((n) => /^docker-compose.*\.yml$/.test(n)),
  ]
  return files.filter((f) => existsSync(path.join(ROOT, f)))
}

describe('no company deploy identity in the deploy files', () => {
  const files = deployIdentityFiles()

  it('finds the files it is meant to guard', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        '.github/workflows/e2e.yml',
        'Dockerfile',
        'docker-entrypoint.sh',
        'docker-compose.yml',
        'docker-compose.test.yml',
      ]),
    )
  })

  it.each(files)('%s names no company registry, Coolify or production host', (file) => {
    const text = read(file)
    const patterns = SHELL_COMMENT_EXEMPT_FOR_COOLIFY.has(file)
      ? COMPANY_PATTERNS.filter(([n]) => n !== 'coolify')
      : COMPANY_PATTERNS
    expect(companyReferences(text, patterns)).toEqual([])
    if (SHELL_COMMENT_EXEMPT_FOR_COOLIFY.has(file)) {
      expect(companyReferences(stripComments(text), COMPANY_PATTERNS.filter(([n]) => n === 'coolify'))).toEqual([])
    }
  })

  it('flags each forbidden name in a bad string (negative cases)', () => {
    expect(companyReferences('curl "$COOLIFY_URL/api/v1/deploy"')).toEqual(['coolify'])
    expect(companyReferences('uses: coolify-deploy')).toEqual(['coolify'])
    expect(companyReferences('image: ghcr.io/bistec-oss/studio:latest')).toEqual([
      'ghcr.io/bistec-oss',
      'bistec-oss/studio',
    ])
    expect(companyReferences('repo bistec-oss/studio')).toEqual(['bistec-oss/studio'])
    expect(companyReferences('curl https://studio.bistecglobal.com/api/health')).toEqual([
      'studio.bistecglobal.com',
    ])
    expect(companyReferences('image: pgsty/silo:tag')).toEqual([])
  })

  it('the entrypoint exemption drops comments only, not code (negative case)', () => {
    const bad = '# a Coolify comment\ncurl "$COOLIFY_URL"\n'
    expect(companyReferences(stripComments(bad), COMPANY_PATTERNS.filter(([n]) => n === 'coolify'))).toEqual([
      'coolify',
    ])
    expect(companyReferences(stripComments('# a Coolify comment\nexec "$@"\n'))).toEqual([])
  })
})

// --- check 2: every MinIO-role image is silo pinned by digest ------------------------------

const SILO_PINNED = /^pgsty\/silo:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}$/
// An image reference whose last path segment is minio or silo, e.g. quay.io/minio/minio:tag.
const MINIO_ROLE_IMAGE = /(?<![A-Za-z0-9:./_@-])(?:[a-z0-9.-]+\/)+(?:minio|silo)(?::[^\s'"]+)?/g
const MINIO_ROLE_IMAGE_BARE = /(?<![A-Za-z0-9:./_@-])image:\s*(minio|silo)(?::[^\s'"]+)?(?=\s|$)/gm

function minioRoleImages(text: string): string[] {
  const code = stripComments(text)
  const found = [...(code.match(MINIO_ROLE_IMAGE) ?? [])]
  for (const m of code.matchAll(MINIO_ROLE_IMAGE_BARE)) found.push(m[0].replace(/^image:\s*/, ''))
  return found
}

/** MinIO-role images that are not `pgsty/silo:<tag>@sha256:<64 hex>`. */
function unpinnedMinioImages(text: string): string[] {
  return minioRoleImages(text).filter((img) => !SILO_PINNED.test(img))
}

const SILO = 'pgsty/silo:RELEASE.2026-09-16T00-00-00Z@sha256:' + 'a'.repeat(64)

describe('every MinIO-role image is silo pinned by digest', () => {
  const files = ['docker-compose.yml', 'docker-compose.test.yml', '.github/workflows/e2e.yml']

  it.each(files)('%s runs at least one silo image and no other MinIO image', (file) => {
    const text = read(file)
    expect(minioRoleImages(text).length).toBeGreaterThan(0)
    expect(unpinnedMinioImages(text)).toEqual([])
  })

  it('accepts a pinned silo image (positive case)', () => {
    expect(unpinnedMinioImages(`    image: ${SILO}`)).toEqual([])
    expect(unpinnedMinioImages(`docker run -d --name minio -p 9100:9000 ${SILO} server /data`)).toEqual([])
  })

  it('ignores a MinIO health URL and comments that name the old image', () => {
    expect(unpinnedMinioImages('curl -f http://localhost:9000/minio/health/live')).toEqual([])
    expect(unpinnedMinioImages('# docker.io/minio/minio was deleted\n    image: ' + SILO)).toEqual([])
  })

  it('flags a minio/minio image (negative case)', () => {
    expect(unpinnedMinioImages('    image: minio/minio:latest')).toEqual(['minio/minio:latest'])
    expect(unpinnedMinioImages('docker run quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z server /data')).toEqual([
      'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z',
    ])
  })

  it('flags a silo image with no digest or a short digest (negative cases)', () => {
    expect(unpinnedMinioImages('    image: pgsty/silo:RELEASE.2026-09-16T00-00-00Z')).toHaveLength(1)
    expect(unpinnedMinioImages('    image: pgsty/silo:tag@sha256:abc123')).toHaveLength(1)
    expect(unpinnedMinioImages('    image: pgsty/silo')).toHaveLength(1)
  })
})

// --- check 3: no hard-coded container names of another clone's stack -----------------------

const FOREIGN_CONTAINER = /designer-(postgres|minio)/

function foreignContainerNames(text: string): string[] {
  return text.match(new RegExp(FOREIGN_CONTAINER.source, 'g')) ?? []
}

function containerNameFiles(): string[] {
  return [
    ...walk('scripts'),
    'package.json',
    ...walk('.github'),
    ...readdirSync(ROOT).filter((n) => /^docker-compose.*\.yml$/.test(n)),
    'CLAUDE.md',
    'docs/cold-start.md',
    'docs/e2e-test-plan.md',
  ].filter((f) => existsSync(path.join(ROOT, f)))
}

describe('no hard-coded container names from the other clone', () => {
  const files = containerNameFiles()

  it('finds the files it is meant to guard', () => {
    expect(files).toEqual(
      expect.arrayContaining(['package.json', 'CLAUDE.md', 'docs/cold-start.md', 'docs/e2e-test-plan.md']),
    )
    expect(files.some((f) => f.startsWith('scripts/'))).toBe(true)
    expect(files.some((f) => f.startsWith('.github/'))).toBe(true)
  })

  it.each(files)('%s names no designer-postgres or designer-minio container', (file) => {
    expect(foreignContainerNames(read(file))).toEqual([])
  })

  it('flags both names in a bad string (negative case)', () => {
    expect(foreignContainerNames('docker exec designer-postgres-1 psql')).toEqual(['designer-postgres'])
    expect(foreignContainerNames('docker logs designer-minio-1')).toEqual(['designer-minio'])
    expect(foreignContainerNames('docker compose exec -T postgres psql')).toEqual([])
  })
})

// --- check 4: no reference to a deleted company-only doc -----------------------------------

const frag = (...parts: string[]) => parts.join('-')
const DELETED_DOC_STEMS = [
  frag('devops', 'deploy', 'handover'),
  frag('minio', 'silo', 'migration'),
  frag('coolify', 'token', 'rotation'),
  frag('prod', 'e2e', 'findings'),
  frag('scheduler', 'b4', 'diagnosis'),
]
const DELETED_DOC_RE = new RegExp(DELETED_DOC_STEMS.join('|'))

function deletedDocNames(text: string): string[] {
  return text.match(new RegExp(DELETED_DOC_RE.source, 'g')) ?? []
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  '.specclaw',
  '.superpowers',
  'dist',
  'out',
  'build',
  'coverage',
  'playwright-report',
  'test-results',
  'ui-captures',
])
const TEXT_EXT = new Set([
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
  '.css',
  '.html',
  '.txt',
  '.sql',
  '.prisma',
  '.toml',
  '.example',
])
const TEXT_BASENAMES = new Set(['Dockerfile', '.gitattributes', '.editorconfig', '.dockerignore', '.gitignore', '.nvmrc', '.prettierrc'])

function trackedTextFiles(): string[] {
  return walk('', (rel, isDir) => {
    const base = rel.split('/').pop() as string
    if (isDir) return SKIP_DIRS.has(base) || base.startsWith('brag-output')
    if (rel === 'package-lock.json') return true
    return !(TEXT_EXT.has(path.extname(base)) || TEXT_BASENAMES.has(base) || rel.startsWith('.husky/'))
  })
}

describe('no reference to a deleted company-only doc', () => {
  it('the docs are really gone', () => {
    for (const stem of DELETED_DOC_STEMS) {
      const hits = walk('docs').filter((f) => f.includes(stem))
      expect(hits).toEqual([])
    }
  })

  it('no text file outside .specclaw and .superpowers names one', () => {
    const files = trackedTextFiles()
    expect(files.length).toBeGreaterThan(100)
    expect(files).toEqual(expect.arrayContaining(['CLAUDE.md', 'docs/history.md', 'docs/handoff.md']))
    const offenders = files.filter((f) => deletedDocNames(read(f)).length > 0)
    expect(offenders).toEqual([])
  })

  it('flags a deleted doc name in a bad string (negative case)', () => {
    for (const stem of DELETED_DOC_STEMS) {
      expect(deletedDocNames(`see docs/${stem}.md for details`)).toEqual([stem])
    }
    expect(deletedDocNames('see docs/cold-start.md')).toEqual([])
  })
})
