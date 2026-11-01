import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PROJECT_NOT_FOUND } from '@/lib/projects/errors'
import { withTeamAuth, withTeamAdmin } from '@/lib/api/handler'
import { BUCKET_DOCS, uploadObject, validateUpload } from '@/lib/storage/minio'
import {
  MAX_DOCS_PER_PROJECT,
  isAllowedDocument,
  isAllowedDocImage,
  parseDocumentText,
} from '@/lib/projects/documents'

type Params = { id: string }

const DOC_SELECT = {
  id: true,
  name: true,
  contentType: true,
  sizeBytes: true,
  truncated: true,
  createdAt: true,
} as const

// Team tenancy fix: this ran under plain withAuth with no teamId check at
// all — any authenticated user of ANY team could list another team's
// project-document metadata by projectId.
export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!project || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const docs = await prisma.projectDocument.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: 'asc' },
    select: DOC_SELECT,
  })
  return NextResponse.json(docs)
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!project || project.teamId !== user.teamId) {
    return NextResponse.json(PROJECT_NOT_FOUND, { status: 404 })
  }

  const fd = await req.formData()
  const file = fd.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const sizeError = validateUpload(file)
  if (sizeError) return NextResponse.json({ error: sizeError }, { status: 400 })
  const isImage = isAllowedDocImage(file.type, file.name)
  if (!isImage && !isAllowedDocument(file.type, file.name)) {
    return NextResponse.json(
      { error: 'Unsupported file type — use PDF, DOCX, TXT, Markdown, PNG, or JPG' },
      { status: 400 }
    )
  }

  const count = await prisma.projectDocument.count({ where: { projectId: params.id } })
  if (count >= MAX_DOCS_PER_PROJECT) {
    return NextResponse.json(
      { error: `A project can hold at most ${MAX_DOCS_PER_PROJECT} documents — delete one first` },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Images skip text extraction — they are fed to the vision model instead
  // (projectDocImageUrls) and store empty parsedText.
  let parsed = { text: '', truncated: false }
  if (!isImage) {
    try {
      parsed = await parseDocumentText(buffer, file.type, file.name)
    } catch (err) {
      console.error(`[documents] failed to parse ${file.name}:`, err)
      return NextResponse.json(
        { error: 'Could not extract text from this file — is it a valid document?' },
        { status: 400 }
      )
    }
    if (!parsed.text) {
      return NextResponse.json(
        { error: 'No text could be extracted from this file' },
        { status: 400 }
      )
    }
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const objectKey = `projects/${params.id}/${Date.now()}-${safeName}`
  // Normalize image contentType from the extension when the browser omits it —
  // projectDocImageUrls selects image docs by this stored value.
  const contentType =
    isImage && !file.type ? (/\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg') : file.type || 'application/octet-stream'
  await uploadObject(buffer, BUCKET_DOCS, objectKey, contentType)

  const doc = await prisma.projectDocument.create({
    data: {
      teamId: project.teamId,
      projectId: params.id,
      name: file.name,
      contentType,
      sizeBytes: file.size,
      objectKey,
      parsedText: parsed.text,
      truncated: parsed.truncated,
      createdBy: user.userId,
    },
    select: DOC_SELECT,
  })

  return NextResponse.json(doc, { status: 201 })
})
