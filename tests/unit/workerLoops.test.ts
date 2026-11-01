// 037 FR-03 / AC-12: the worker's loops are one named list. T2 removed the
// generation loop; T4 reduces the set to `retention` alone.

import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { LOOPS } from '@/scheduler/loops'

describe('the worker loops', () => {
  it('are exactly one loop, retention', () => {
    expect([...LOOPS]).toEqual(['retention'])
    expect(LOOPS).not.toContain('generation')
    expect(LOOPS).not.toContain('scheduler')
  })

  it('the worker starts exactly the loops in the list', () => {
    const worker = readFileSync(join(process.cwd(), 'src/scheduler/worker.ts'), 'utf8')
    expect(worker).toMatch(/LOOPS\.map\(/)
    expect(worker).not.toMatch(/generationRunner|logTeamsWithoutClaudeToken/)
  })
})
