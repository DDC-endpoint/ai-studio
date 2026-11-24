# Tasks: Deploy-day docs and the Aloys carry-over

**Change:** 041-deploy-day-docs-aloys-carryover
**Created:** 2026-11-24
**Total Tasks:** 2

## Summary

T1 writes the docs. T2 rehearses the carry-over section on a scratch stack, exactly as written, and corrects the doc wherever the rehearsal differs.

## Tasks

### Wave 1 — Docs

- [x] `T1` — Refresh `docs/deploy.md` and add the carry-over section; record the override
  - Files: `docs/deploy.md`, `CLAUDE.md`, memory `project_fresh_start_no_import.md` (outside the repo)
  - Estimate: medium
  - Kind: docs
  - Notes: FR-01 to FR-06. Placeholders for every secret and for `<MINIO_PUBLIC_ENDPOINT>`. Use the seven columns and facts in spec.md "Overview". Bucket copy via `docker compose exec minio mc` plus `docker compose cp`; no host `mc` or Node on the server.

### Wave 2 — Rehearsal

- [ ] `T2` — Rehearse the carry-over on a scratch stack and correct the doc
  - Files: `docs/deploy.md` (corrections only)
  - Estimate: medium
  - Kind: test
  - Depends: T1
  - Notes: AC-03 and AC-04. Use a separate compose project and ports, never `ai_studio` or `ai_studio_test`, and a non-localhost `MINIO_PUBLIC_ENDPOINT`. Record the local counts before and after. Tear the scratch stack down afterwards with `down -v`. Leave nothing in the repo. Commands and output go to verify-report.md.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
- `[>]` Deferred
