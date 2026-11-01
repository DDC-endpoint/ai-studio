# Timeline: 040-template-viewer

**Total measured (leaf spans):** 13m28s · **Retries:** 0 · **Open spans:** 1 ⏱ still running

## By kind

- **phase** — 2m50s across 2 span(s)
- **task** — 13m28s across 4 span(s)
- **wave** — 13m45s across 3 span(s)

## Slowest

- `W1` (wave) — wave 1 — **7m02s**
- `T1` (task) — TemplatePreview atom and kit viewer — **4m51s**
- `W3` (wave) — wave 3 — **4m18s**

## Spans

| Span                | Kind  | Label                               | Model  | Attempt | Status | Duration        |
| ------------------- | ----- | ----------------------------------- | ------ | ------- | ------ | --------------- |
| `propose`           | phase | propose                             | -      | -       | ok     | 1m12s           |
| `plan`              | phase | plan                                | -      | -       | ok     | 1m38s           |
| `W1`                | wave  | wave 1                              | -      | -       | ok     | 7m02s           |
| `T1`                | task  | TemplatePreview atom and kit viewer | sonnet | 1       | ok     | 4m51s           |
| `T2`                | task  | GET /api/templates/[id]             | sonnet | 1       | ok     | 1m56s           |
| `W2`                | wave  | wave 2                              | -      | -       | ok     | 2m25s           |
| `T3`                | task  | Wizard preview                      | sonnet | 1       | ok     | 2m24s           |
| `W3`                | wave  | wave 3                              | -      | -       | ok     | 4m18s           |
| `T4`                | task  | E2E                                 | sonnet | 1       | ok     | 4m17s           |
| `verify-1793365625` | phase | verify                              | -      | -       | -      | ⏱ still running |

_No baseline: this project has no archived timelines to compare against yet._
