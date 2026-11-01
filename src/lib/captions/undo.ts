// The one-step undo snapshot of a caption row (039 D4, D15): what `previous`
// holds. Pure and client-safe (the general hash, which needs node:crypto, lives
// in a server-only module).

import { z } from 'zod'

export const captionSnapshotSchema = z
  .object({
    v: z.literal(1),
    text: z.string(),
    deleted: z.boolean(),
    model: z.string().nullable(),
    modelSubstitutedFrom: z.string().nullable(),
    route: z.string().nullable(),
    generalHash: z.string().nullable(),
  })
  .strict()

export type CaptionSnapshot = z.infer<typeof captionSnapshotSchema>

/** Reads a stored `previous`; null on anything unreadable. Never throws. */
export function parseCaptionSnapshot(raw: unknown): CaptionSnapshot | null {
  const parsed = captionSnapshotSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** The snapshot of a row's current state, written before the row changes. */
export function snapshotOf(row: {
  text: string
  deletedAt: Date | null
  model: string | null
  modelSubstitutedFrom: string | null
  route: string | null
  generalHash: string | null
}): CaptionSnapshot {
  return {
    v: 1,
    text: row.text,
    deleted: row.deletedAt !== null,
    model: row.model,
    modelSubstitutedFrom: row.modelSubstitutedFrom,
    route: row.route,
    generalHash: row.generalHash,
  }
}
