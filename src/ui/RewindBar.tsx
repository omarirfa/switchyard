import { ClockCounterClockwise, SkipForward } from "@phosphor-icons/react"
import { clock } from "./format.ts"

// Drag back through the run. Every panel below shows the run as it was at that moment.
export const RewindBar = ({ liveNow, at, onChange, onLive }: {
  readonly liveNow: number
  readonly at: number | null
  readonly onChange: (ms: number) => void
  readonly onLive: () => void
}) => {
  const max = Math.max(1, Math.ceil(liveNow / 100) * 100)
  const value = at ?? max
  const live = at === null
  return (
    <div className={live ? "rewind" : "rewind rewinding"} role="group" aria-label="Rewind">
      <label className="rewind-label" htmlFor="rewind-slider">
        <ClockCounterClockwise aria-hidden="true" />
        {live ? "Rewind" : `Viewing ${clock(value)}`}
      </label>
      <input
        id="rewind-slider"
        type="range"
        min={0}
        max={max}
        step={100}
        value={Math.min(value, max)}
        aria-valuetext={`${clock(value)} of ${clock(max)}`}
        onChange={(e) => {
          const v = Number(e.currentTarget.value)
          if (v >= max) onLive()
          else onChange(v)
        }}
      />
      <span className="rewind-time">
        {clock(value)} <span className="quiet">/ {clock(liveNow)}</span>
      </span>
      <button id="rewind-live" type="button" className="btn btn-quiet" onClick={onLive} disabled={live}>
        <SkipForward aria-hidden="true" />
        Back to live
      </button>
    </div>
  )
}
