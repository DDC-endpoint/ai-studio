// 038 FR-03: the access tier of every post-keyed route handler, as plain data.
//   view: any member of the post's team (the route calls canView, never canEditPost)
//   edit: the author or a team admin (canView for the 404, then canEditPost for
//         the 403 `not-author`)
//   none: no existing post is touched (a brief or an upload is created for the
//         caller's own team)
// The key is '<route file path> <METHOD>'. tests/unit/postActionTiers.test.ts
// walks the route files and fails when a handler or a key has no partner, or
// when the predicate in the file does not match its tier.
export type PostActionTier = 'view' | 'edit' | 'none'

export const POST_ACTION_TIERS: Record<string, PostActionTier> = {
  'src/app/api/drafts/[id]/route.ts GET': 'view',
  'src/app/api/drafts/[id]/route.ts PATCH': 'edit',
  'src/app/api/drafts/[id]/route.ts DELETE': 'edit',
  'src/app/api/drafts/[id]/apply-text/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/download/route.ts GET': 'view',
  'src/app/api/drafts/[id]/inline-edit/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/refine/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/regenerate-copy/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/regenerate-design/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/rejected/[revisionId]/adopt/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/retry/route.ts POST': 'edit',
  'src/app/api/drafts/[id]/revisions/route.ts GET': 'view',
  'src/app/api/drafts/[id]/revisions/[rev]/restore/route.ts POST': 'edit',
  'src/app/api/generate/assemble-a/route.ts POST': 'edit',
  'src/app/api/generate/assemble-b/route.ts POST': 'edit',
  'src/app/api/generate/copy/route.ts POST': 'edit',
  'src/app/api/generate/image/route.ts POST': 'edit',
  'src/app/api/briefs/route.ts POST': 'none',
  'src/app/api/briefs/enhance/route.ts POST': 'none',
  'src/app/api/briefs/images/route.ts POST': 'none',
  'src/app/api/briefs/screenshots/route.ts POST': 'none',
  'src/app/api/briefs/screenshots/route.ts GET': 'none',
}

// Each DraftAction value and the route that starts it (an edit-tier route).
export const DRAFT_ACTION_ROUTES = {
  REFINE: 'src/app/api/drafts/[id]/refine/route.ts POST',
  REGENERATE_COPY: 'src/app/api/drafts/[id]/regenerate-copy/route.ts POST',
  REGENERATE_DESIGN: 'src/app/api/drafts/[id]/regenerate-design/route.ts POST',
  APPLY_TEXT: 'src/app/api/drafts/[id]/apply-text/route.ts POST',
} as const
