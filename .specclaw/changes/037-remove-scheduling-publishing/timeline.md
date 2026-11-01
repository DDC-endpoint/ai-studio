# Timeline: 037-remove-scheduling-publishing

**Total measured (leaf spans):** 2h14m17s · **Retries:** 0 · **Open spans:** 1 ⏱ still running

## By kind

- **phase** — 10m07s across 2 span(s)
- **task** — 2h14m17s across 6 span(s)
- **wave** — 2h14m18s across 6 span(s)

## Slowest

- `W6` (wave) — wave 6 — **1h12m28s**
- `T6` (task) — Docs, full E2E, CI — **1h12m28s**
- `W4` (wave) — wave 4 — **16m23s**

## Spans

| Span                | Kind  | Label                                                  | Model  | Attempt | Status | Duration        |
| ------------------- | ----- | ------------------------------------------------------ | ------ | ------- | ------ | --------------- |
| `propose`           | phase | propose                                                | -      | -       | ok     | 0s              |
| `plan`              | phase | plan                                                   | -      | -       | ok     | 10m07s          |
| `W1`                | wave  | wave 1                                                 | -      | -       | ok     | 10m53s          |
| `T1`                | task  | Download replaces Export                               | sonnet | 1       | ok     | 10m53s          |
| `W2`                | wave  | wave 2                                                 | -      | -       | ok     | 13m43s          |
| `T2`                | task  | Remove queue, generation loop, briefing plan           | sonnet | 1       | ok     | 13m43s          |
| `W3`                | wave  | wave 3                                                 | -      | -       | ok     | 9m18s           |
| `T3`                | task  | Remove publish UI; library filters; dashboard KPIs     | sonnet | 1       | ok     | 9m18s           |
| `W4`                | wave  | wave 4                                                 | -      | -       | ok     | 16m23s          |
| `T4`                | task  | Remove publish backend                                 | sonnet | 1       | ok     | 16m22s          |
| `W5`                | wave  | wave 5                                                 | -      | -       | ok     | 11m33s          |
| `T5`                | task  | Fail-closed migration, clear script, PUBLISHED removal | sonnet | 1       | ok     | 11m33s          |
| `W6`                | wave  | wave 6                                                 | -      | -       | ok     | 1h12m28s        |
| `T6`                | task  | Docs, full E2E, CI                                     | sonnet | 1       | ok     | 1h12m28s        |
| `verify-1793384598` | phase | verify                                                 | -      | -       | -      | ⏱ still running |

_No baseline: this project has no archived timelines to compare against yet._
