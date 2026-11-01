/**
 * Pure planning for scripts/sweep-campaign-documents.mjs (038 FR-23, AC-19).
 *
 * `keys` lists the object keys in BUCKET_DOCS. `state.dropCommitted` is true when
 * the drop migration has been recorded as applied and `state.documentTableExists`
 * is true while the CampaignDocument table is still there. `opts.yes` is --yes.
 * It returns the lines to print, the keys to delete (empty on a dry run) and the
 * exit code: 0 nothing to do or swept; 3 keys found on a dry run; 4 the drop
 * migration has not committed (the files may still be referenced).
 *
 * Keys under brandkits/, screenshots/ and projects/ belong to live features and
 * are never selected. A campaign document key had exactly the shape
 * `<campaign cuid>/<Date.now()>-<name>` (the old campaign documents route), so
 * only that shape is selected: a key under any other or future prefix is kept.
 */
export const KEEP_PREFIXES = ['brandkits', 'screenshots', 'projects']
const CAMPAIGN_DOC_KEY = /^c[a-z0-9]{20,32}\/\d{10,}-[^/]+$/

export function selectOrphans(keys) {
  return keys.filter((k) => !KEEP_PREFIXES.includes(k.split('/')[0]) && CAMPAIGN_DOC_KEY.test(k))
}

export function planSweep(keys, { dropCommitted = false, documentTableExists = true } = {}, { yes = false } = {}) {
  if (!dropCommitted || documentTableExists) {
    return {
      lines: [
        'Refusing to sweep: the drop migration 20261101130000_drop_campaigns has not committed (the CampaignDocument table still exists or the migration is not recorded). Run npm run db:migrate first.',
      ],
      deletes: [],
      exitCode: 4,
    }
  }
  const orphans = selectOrphans(keys)
  const lines = [`Objects in the bucket: ${keys.length}`, `Campaign document objects: ${orphans.length}`]
  if (orphans.length === 0) {
    lines.push('Nothing to sweep.')
    return { lines, deletes: [], exitCode: 0 }
  }
  if (!yes) {
    for (const k of orphans) lines.push(`  - ${k}`)
    lines.push('Dry run: nothing deleted. Run again with --yes to delete these objects.')
    return { lines, deletes: [], exitCode: 3 }
  }
  return { lines, deletes: orphans, exitCode: 0 }
}
