# Spec: Browser tab title "ai-studio"

**Change:** 036-browser-title-ai-studio
**Created:** 2026-10-28
**Size:** bounded

## Requirements

- **FR-01:** The root metadata `title` in `src/app/layout.tsx` is `'ai-studio'`. Every page that does not set its own title shows "ai-studio" in the browser tab.

## Acceptance Criteria

- **AC-01:** `GET /login` on a running server returns HTML whose `<title>` is `ai-studio`.
- **AC-02:** `grep -n "title: 'bistec-studio'" src/app/layout.tsx` finds nothing.
- **AC-03:** `tsc`, lint and the unit suite pass.

## Approach

| File                 | Change                                                |
| -------------------- | ----------------------------------------------------- |
| `src/app/layout.tsx` | `title: 'bistec-studio'` becomes `title: 'ai-studio'` |

Nothing else changes: the ACP and MCP names, prompt text and the "Studio" wordmark are out of scope (proposal).
