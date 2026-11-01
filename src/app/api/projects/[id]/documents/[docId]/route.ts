import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, deleteObject } from '@/lib/storage/minio'

type Params = { id: string; docId: string }

export const DELETE = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!project || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const doc = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
  })
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.projectDocument.delete({ where: { id: doc.id } })

  // Best-effort: the DB row is the source of truth; a dangling object is harmless.
  try {
    await deleteObject(BUCKET_DOCS, doc.objectKey)
  } catch (err) {
    console.warn(`[documents] failed to delete object ${doc.objectKey}:`, err)
  }

  return NextResponse.json({ deleted: doc.id })
})
