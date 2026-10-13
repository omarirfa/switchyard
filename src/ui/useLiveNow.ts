import { useEffect, useRef, useState } from "react"
import type { FleetView } from "../domain/Fleet.ts"

// Run time in milliseconds, advancing between events while the run is running.
// It starts from the latest event's `at` and adds the wall-clock time since that view arrived.
export const useLiveNow = (view: FleetView): number => {
  const received = useRef({ version: -1, wall: 0 })
  const [, setTick] = useState(0)

  if (received.current.version !== view.version) {
    received.current = { version: view.version, wall: performance.now() }
  }

  useEffect(() => {
    if (view.phase !== "running") return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [view.phase])

  return view.phase === "running" ? view.now + (performance.now() - received.current.wall) : view.now
}
