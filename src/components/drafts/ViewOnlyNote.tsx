// 038 D11: shown on the post page, in place of the edit controls, to a team
// member who is not the post's author or a team admin. One muted line; the
// routes enforce the rule, so nothing here is a disabled control.
export function ViewOnlyNote() {
  return (
    <p className="mt-2 text-ui-xs text-fg-muted" data-testid="view-only-note">
      View only. Only the author or a team admin can change this post. You can still download it and copy its captions.
    </p>
  )
}
