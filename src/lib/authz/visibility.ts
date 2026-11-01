import type { TeamAuthedUser } from '@/lib/api/handler'

// 038 D10/D11: every member of a team sees every post; only the author and
// team admins change one. Pure: a type import only.
export const isTeamAdmin = (u: TeamAuthedUser) => u.teamRole === 'ADMIN' || u.isSuperAdmin

export const draftVisibilityWhere = (u: TeamAuthedUser) => ({ teamId: u.teamId })

export const canView = (u: TeamAuthedUser, item: { teamId: string | null }) =>
  item.teamId === u.teamId

export const canEditPost = (
  u: TeamAuthedUser,
  item: { teamId: string | null; ownerId: string },
) => item.teamId === u.teamId && (item.ownerId === u.userId || isTeamAdmin(u))

export const NOT_AUTHOR = {
  error: 'Only the author or a team admin can change this post',
  code: 'not-author',
} as const
