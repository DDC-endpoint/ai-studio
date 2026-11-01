// What a caption action did to its row (039 D25): `create` when the target row
// did not exist before the claim (a curated caption made on request, or a
// general caption on a post made before 039), `replace` otherwise. The one
// owner of the vocabulary: the analytics catalogue imports it.
export const CAPTION_OPS = ['create', 'replace'] as const
export type CaptionOp = (typeof CAPTION_OPS)[number]
