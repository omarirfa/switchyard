import { Check, X } from "@phosphor-icons/react"
import type { Lanes } from "../domain/Timeline.ts"
import { agentName, clock, statusLabel } from "./format.ts"

const pct = (t: number, domain: number) => `${(Math.min(t, domain) / domain) * 100}%`

const legend = [
  { key: "working", label: "Working" },
  { key: "testing", label: "Testing" },
  { key: "blocked", label: "Blocked" },
  { key: "commit", label: "Commit" },
  { key: "conflict", label: "Conflict" },
  { key: "merge", label: "Merge" }
] as const

export const RunTimeline = ({ tl, running }: { readonly tl: Lanes; readonly running: boolean }) => {
  const step = tl.domain <= 10_000 ? 1_000 : tl.domain <= 30_000 ? 5_000 : tl.domain <= 120_000 ? 15_000 : 60_000
  const ticks = Array.from({ length: Math.floor(tl.domain / step) + 1 }, (_, i) => i * step)

  return (
    <div className="lanes-wrap">
      <ul className="legend" aria-label="Legend">
        {legend.map((l) => (
          <li key={l.key}>
            <span className={`swatch sw-${l.key}`} aria-hidden="true" />
            {l.label}
          </li>
        ))}
      </ul>

      <div className="tl" role="img" aria-label={`Timeline of ${tl.tracks.length} agents over ${clock(tl.now)}`}>
        <div className="tl-row tl-axis" aria-hidden="true">
          <span className="tl-label" />
          <div className="tl-track">
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: pct(t, tl.domain) }}>
                {clock(t)}
              </span>
            ))}
          </div>
        </div>

        {tl.tracks.length === 0 && (
          <div className="tl-row">
            <span className="tl-label quiet">No agents</span>
            <div className="tl-track" />
          </div>
        )}

        {tl.tracks.map((track) => (
          <div className="tl-row" key={track.agentId}>
            <span className="tl-label">{agentName(track.agentId)}</span>
            <div className="tl-track">
              {ticks.map((t) => <span key={t} className="grid" style={{ left: pct(t, tl.domain) }} />)}

              {tl.conflicts.filter((c) => c.agentIds.includes(track.agentId)).map((c) => {
                const to = c.to ?? tl.now
                return (
                  <span
                    key={c.conflictId}
                    className={c.to === undefined ? "conflict open" : "conflict"}
                    style={{ left: pct(c.from, tl.domain), width: pct(Math.max(to - c.from, 120), tl.domain) }}
                    title={`Conflict in ${c.file}`}
                  />
                )
              })}

              {track.segments.map((s, i) => (
                <span
                  key={i}
                  className={`seg-bar sb-${s.status}`}
                  style={{ left: pct(s.from, tl.domain), width: pct(Math.max(s.to - s.from, 60), tl.domain) }}
                  title={`${statusLabel[s.status]} from ${clock(s.from)} to ${clock(s.to)}`}
                />
              ))}

              {track.commits.map((c) => (
                <span
                  key={c.sha}
                  className="commit-mark"
                  style={{ left: pct(c.at, tl.domain) }}
                  title={`${c.sha} ${c.message}`}
                />
              ))}

              {track.endedAt !== undefined && track.endStatus !== undefined && (
                <span
                  className={`end-mark em-${track.endStatus}`}
                  style={{ left: pct(track.endedAt, tl.domain) }}
                  title={`${statusLabel[track.endStatus]} at ${clock(track.endedAt)}`}
                >
                  {track.endStatus === "done"
                    ? <Check size={10} weight="bold" aria-hidden="true" />
                    : <X size={10} weight="bold" aria-hidden="true" />}
                </span>
              )}

              {tl.mergeAt !== undefined && <span className="merge-line" style={{ left: pct(tl.mergeAt, tl.domain) }} />}
              {running && <span className="playhead" style={{ left: pct(tl.now, tl.domain) }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
