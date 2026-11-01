// The inputs a post was generated with (038 D3). Pure: zod only, so the browser
// and the tests can import it. The stamp lives in Draft.generationInputs and is
// written once, when the draft is created; only "apply project settings" rewrites it.
import { z } from 'zod'

export const KIT_SOURCES = ['explicit', 'project', 'team'] as const
export type KitSource = (typeof KIT_SOURCES)[number]

export const generationInputsSchema = z.object({
  v: z.literal(1),
  projectId: z.string().min(1).max(64).nullable(),
  briefingId: z.string().min(1).max(64).nullable(),
  briefingVersion: z.number().int().positive().nullable(),
  kitId: z.string().min(1).max(64).nullable(),
  kitSource: z.enum(KIT_SOURCES).nullable(),
})

export type GenerationInputs = z.infer<typeof generationInputsSchema>

// A tolerant read of Draft.generationInputs: null on anything unreadable (the
// stamp is null for a draft made before 038, and that reads as "no project").
export function parseGenerationInputs(raw: unknown): GenerationInputs | null {
  const parsed = generationInputsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

// The stamp of a post with no project: the kit is whatever resolved, no briefing.
export function NO_PROJECT_INPUTS(kit: { id: string; source: KitSource } | null): GenerationInputs {
  return {
    v: 1,
    projectId: null,
    briefingId: null,
    briefingVersion: null,
    kitId: kit?.id ?? null,
    kitSource: kit?.source ?? null,
  }
}

// Two stamps are the same inputs when project, briefing and kit agree (D8).
export function sameInputs(a: GenerationInputs | null, b: GenerationInputs | null): boolean {
  const pick = (x: GenerationInputs | null) => ({
    projectId: x?.projectId ?? null,
    briefingId: x?.briefingId ?? null,
    kitId: x?.kitId ?? null,
  })
  const [x, y] = [pick(a), pick(b)]
  return x.projectId === y.projectId && x.briefingId === y.briefingId && x.kitId === y.kitId
}
