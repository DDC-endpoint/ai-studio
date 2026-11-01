// The "scheduler" container: the name is historical (037 D9). It runs only
// analytics retention.
import { runTick } from "../lib/scheduler/heartbeat"
import { sweepAnalytics } from "../lib/analytics/retention"
import { LOOPS, type LoopName } from "./loops"

const POLL_INTERVAL_MS = 60_000

// One independent poll loop per job type, so a slow tick in one never delays
// another. Names come from ./loops.
async function loop(name: LoopName, run: () => Promise<void>) {
  while (true) {
    try {
      await runTick(name, run)
    } catch (err) {
      console.error(`[${name}] tick error:`, err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

// What each named loop runs. Typed on LoopName, so a loop added to ./loops
// without a runner here does not compile.
const RUNNERS: Record<LoopName, () => Promise<void>> = {
  // 006 FR-11: analytics retention. Writes its own WorkerHeartbeat row ("retention")
  // through runTick; Insights reads it as the Health line.
  retention: async () => {
    await sweepAnalytics()
  },
}

async function main() {
  console.log("[scheduler] starting, poll interval:", POLL_INTERVAL_MS, "ms")

  await Promise.all(LOOPS.map(name => loop(name, RUNNERS[name])))
}

main().catch(err => {
  console.error("[scheduler] fatal:", err)
  process.exit(1)
})
