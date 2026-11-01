# Proposal: Browser tab title "ai-studio"

**Created:** 2026-10-28
**Status:** 🟡 Draft

## Problem

The browser tab shows "bistec-studio". The user (2026-10-28) wants the page title to read "ai-studio": the fork is the user's own system now, not the company's.

## Proposed Solution

Change the root metadata title in `src/app/layout.tsx` from `'bistec-studio'` to `'ai-studio'`.

## Scope

### In Scope

- The `title` in `src/app/layout.tsx` metadata (the browser tab title of every page).

### Out of Scope

- The in-app typeset "Studio" wordmark (user decision 2026-10-07, re-confirmed 2026-10-27).
- The ACP manifest `name` and MCP server name (`src/acp/agent.ts`, `src/mcp/server.ts`), which peers and `acp.test.ts` read.
- Model prompt text that names "bistec-studio" (`src/lib/brandkit/*`, `src/lib/campaign/briefingAssistant.ts`).
- The package name, docs, internal emails and DB names.

## Impact

- **Size:** bounded (one string in an existing file)
- **Files affected:** 1 (estimated)
- **Complexity:** small
- **Risk:** low

## Open Questions

- None. The user chose "browser tab title only" on 2026-10-28.
