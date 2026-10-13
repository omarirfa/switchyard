import { Effect, Stream } from "effect"
import * as Atom from "effect/reactivity/Atom"
import { RUN_CONFIG, RunEvents } from "../data/RunEvents.ts"
import { FleetStore } from "../domain/Fleet.ts"

const runtime = Atom.runtime(RunEvents.sample)

// Folds each batch of events into one FleetStore and publishes a view per batch.
// Refreshing this atom starts a new store and a new stream.
export const runAtom = runtime.atom(() =>
  Stream.unwrap(Effect.gen(function*() {
    const events = yield* RunEvents
    const store = new FleetStore(RUN_CONFIG)
    return events.stream().pipe(
      Stream.map((batch) => {
        store.ingestAll(batch)
        return store.view()
      })
    )
  }))
)
