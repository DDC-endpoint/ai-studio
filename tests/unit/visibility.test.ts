import { describe, it, expect } from 'vitest'
import {
  draftVisibilityWhere,
  canView,
  canEditPost,
  isTeamAdmin,
  NOT_AUTHOR,
} from '@/lib/authz/visibility'

const admin = { userId: 'a', teamId: 't1', teamRole: 'ADMIN' as const, isSuperAdmin: false }
const editor = { userId: 'e', teamId: 't1', teamRole: 'EDITOR' as const, isSuperAdmin: false }
const superAdmin = { ...editor, userId: 's', isSuperAdmin: true }

describe('visibility (038 D10, D11)', () => {
  it('every role sees the whole team through one where-shape', () => {
    expect(draftVisibilityWhere(admin)).toEqual({ teamId: 't1' })
    expect(draftVisibilityWhere(editor)).toEqual({ teamId: 't1' })
  })

  it('isTeamAdmin is the team admin or a super admin', () => {
    expect(isTeamAdmin(admin)).toBe(true)
    expect(isTeamAdmin(superAdmin)).toBe(true)
    expect(isTeamAdmin(editor)).toBe(false)
  })

  it('canView is team membership of the item, for every role', () => {
    expect(canView(editor, { teamId: 't1' })).toBe(true)
    expect(canView(admin, { teamId: 't1' })).toBe(true)
    expect(canView(editor, { teamId: 't2' })).toBe(false)
    expect(canView(admin, { teamId: 't2' })).toBe(false)
    expect(canView(editor, { teamId: null })).toBe(false)
  })

  it('canEditPost: the author, a team admin and a super admin, in the team only', () => {
    expect(canEditPost(editor, { teamId: 't1', ownerId: 'e' })).toBe(true)
    expect(canEditPost(editor, { teamId: 't1', ownerId: 'x' })).toBe(false)
    expect(canEditPost(admin, { teamId: 't1', ownerId: 'x' })).toBe(true)
    expect(canEditPost(superAdmin, { teamId: 't1', ownerId: 'x' })).toBe(true)
  })

  it('canEditPost refuses another team even to the author or an admin', () => {
    expect(canEditPost(editor, { teamId: 't2', ownerId: 'e' })).toBe(false)
    expect(canEditPost(admin, { teamId: 't2', ownerId: 'x' })).toBe(false)
    expect(canEditPost(superAdmin, { teamId: 't2', ownerId: 'x' })).toBe(false)
  })

  it('NOT_AUTHOR carries the code the routes answer with', () => {
    expect(NOT_AUTHOR.code).toBe('not-author')
  })
})
