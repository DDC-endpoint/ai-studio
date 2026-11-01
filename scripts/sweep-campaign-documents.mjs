/**
 * Operator sweep for the stored campaign documents (038 FR-23), run AFTER the
 * migration 20261101130000_drop_campaigns. Campaign documents lived in the private
 * docs bucket under the campaign id; the migration drops their rows but not their
 * files. This lists the bucket and deletes every object whose first path segment
 * is not brandkits, screenshots or projects.
 *
 *   DATABASE_URL=<url> MINIO_ENDPOINT=<url> MINIO_ACCESS_KEY=<k> MINIO_SECRET_KEY=<s> \
 *     MINIO_BUCKET_DOCS=<bucket> node scripts/sweep-campaign-documents.mjs          (dry run)
 *   ... node scripts/sweep-campaign-documents.mjs --yes                              (delete)
 *
 * It refuses to run unless the drop migration is recorded as applied and the
 * CampaignDocument table is gone (the files could still be referenced). It deletes
 * and logs one key at a time. Every setting must be in the environment: it never
 * reads a .env file and never defaults to the minioadmin keys.
 *
 * Exit codes: 0 done or nothing to sweep, 1 bad usage, 2 a missing explicit
 * setting, 3 keys found on a dry run, 4 the drop migration has not committed.
 */
import { planSweep } from './lib/sweepCampaignDocs.mjs'

// Read the environment BEFORE @prisma/client is imported (it loads a .env file as a side effect).
const REQUIRED = ['DATABASE_URL', 'MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET_DOCS']
const missing = REQUIRED.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`Refusing to run: ${missing.join(', ')} must be set explicitly in the environment.`)
  process.exit(2)
}
const { DATABASE_URL: url, MINIO_ENDPOINT: endpoint, MINIO_ACCESS_KEY: accessKeyId, MINIO_SECRET_KEY: secretAccessKey, MINIO_BUCKET_DOCS: bucket } =
  process.env
if (accessKeyId === 'minioadmin' || secretAccessKey === 'minioadmin') {
  console.error('Refusing to run: the MinIO keys must not be minioadmin.')
  process.exit(2)
}

const args = process.argv.slice(2)
const unknown = args.filter((a) => a !== '--yes')
if (unknown.length > 0) {
  console.error(`Unknown argument: ${unknown.join(' ')}`)
  console.error('Usage: sweep-campaign-documents.mjs [--yes]')
  process.exit(1)
}
const yes = args.includes('--yes')

const { PrismaClient } = await import('@prisma/client')
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3')

const prisma = new PrismaClient({ datasourceUrl: url })
let exitCode = 0
try {
  const [{ reg }] = await prisma.$queryRawUnsafe(`SELECT to_regclass('"CampaignDocument"')::text AS reg`)
  const [{ n }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "_prisma_migrations"
     WHERE "migration_name" = '20261101130000_drop_campaigns'
       AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
  )
  const state = { dropCommitted: n > 0, documentTableExists: reg !== null }

  const s3 = new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })
  const keys = []
  // Only list the bucket once the migration check can pass: a refused run touches nothing.
  if (state.dropCommitted && !state.documentTableExists) {
    let token
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
      for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key)
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }

  const plan = planSweep(keys, state, { yes })
  console.log(`Bucket: ${bucket}`)
  for (const line of plan.lines) console.log(line)
  for (const key of plan.deletes) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    console.log(`deleted ${key}`)
  }
  exitCode = plan.exitCode
} finally {
  await prisma.$disconnect()
}
process.exit(exitCode)
