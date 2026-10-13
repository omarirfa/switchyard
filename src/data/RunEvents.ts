import { Context, Effect, Layer, Schema, Stream } from "effect"
import { CoordinationEvent } from "../domain/Events.ts"
import type { StoreConfig } from "../domain/Fleet.ts"
import { sampleRuns } from "./sampleRuns.ts"
import { simulateFleet } from "./simulate.ts"

// One sample run that grows from a few agents to 10,000. Two scripted tasks open it
// (three competing attempts, then three subtasks), and the simulated fleet joins after
// them. The dashboard reads the agent count from the run, so every panel adapts as the
// count grows; rewinding shows the small-run views again.
export const RUN_CONFIG: StoreConfig = { bucketMs: 250, stallMs: 8_000, timelineBucketMs: 5_000 }

const FLEET_AGENTS = 10_000
const SPLIT_OFFSET_MS = 3_000
const FLEET_START_MS = 10_000
const FLEET_RAMP_MS = 55_000
const WINDOW_MS = 250

const decode = Schema.decodeUnknownSync(CoordinationEvent)

let cache: ReadonlyArray<CoordinationEvent> | undefined
const runEvents = (): ReadonlyArray<CoordinationEvent> => {
  if (cache !== undefined) return cache
  // The scripted events decode through the schema, as a live feed would. Simulated
  // events are built with the schema's own types, so they skip decoding.
  const scripted = (events: typeof sampleRuns.parallel, offset: number) =>
    events
      .map(({ event }) => decode(event))
      .filter((e) => e._tag !== "RunStarted")
      .map((e) => ({ ...e, at: e.at + offset }))
  const all: Array<CoordinationEvent> = [
    { _tag: "RunStarted", at: 0, runId: "sample-run", kind: "fleet", title: "Coordinator run" },
    ...scripted(sampleRuns.parallel, 0),
    ...scripted(sampleRuns.split, SPLIT_OFFSET_MS),
    ...simulateFleet({ agents: FLEET_AGENTS - 6, seed: 20261014, startAt: FLEET_START_MS, startWindowMs: FLEET_RAMP_MS })
  ]
  cache = all.sort((a, b) => a.at - b.at)
  return cache
}

// Source of coordination events, delivered in batches. The preview uses `sample`;
// a `live` layer will read the Worker's feed and decode it with the same schema.
export class RunEvents extends Context.Service<RunEvents, {
  readonly stream: () => Stream.Stream<ReadonlyArray<CoordinationEvent>, Schema.SchemaError>
}>()("switchyard/data/RunEvents") {
  static readonly sample = Layer.succeed(RunEvents)(RunEvents.of({
    stream: () =>
      Stream.suspend(() => {
        const all = runEvents()
        const windows: Array<ReadonlyArray<CoordinationEvent>> = []
        let i = 0
        for (let end = WINDOW_MS; i < all.length; end += WINDOW_MS) {
          const batch: Array<CoordinationEvent> = []
          while (i < all.length && all[i]!.at < end) batch.push(all[i++]!)
          windows.push(batch)
        }
        return Stream.fromIterable(windows).pipe(
          Stream.mapEffect((batch, k) => (k === 0 ? Effect.succeed(batch) : Effect.sleep(WINDOW_MS).pipe(Effect.as(batch))))
        )
      })
  }))
}
