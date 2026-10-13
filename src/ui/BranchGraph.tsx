import { GitBranch } from "@phosphor-icons/react"
import type { Decision } from "../domain/Fleet.ts"
import type { Lanes } from "../domain/Timeline.ts"
import { agentName } from "./format.ts"

const W = 340
const PAD_L = 66
const PAD_R = 18
const MAIN_Y = 22
const ROW = 38

// Draws main and one branch per agent on the run's time axis.
// Merged branches curve back into main at the merge time, in merge order.
export const BranchGraph = ({ tl, decision }: { readonly tl: Lanes; readonly decision: Decision | undefined }) => {
  const x = (t: number) => PAD_L + (Math.min(t, tl.domain) / tl.domain) * (W - PAD_L - PAD_R)
  const height = MAIN_Y + Math.max(tl.tracks.length, 1) * ROW + 18
  const mergeX = (agentId: string) => {
    const order = decision?.merged.indexOf(agentId) ?? -1
    return tl.mergeAt === undefined || order < 0 ? undefined : x(tl.mergeAt) - (decision!.merged.length - 1 - order) * 9
  }
  const mainEnd = tl.mergeAt === undefined ? x(tl.now) : x(tl.mergeAt)

  return (
    <section className="panel" aria-labelledby="graph-title">
      <header className="panel-head">
        <h2 id="graph-title">
          <GitBranch aria-hidden="true" />
          Branches
        </h2>
      </header>
      <svg className="graph" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Branch graph of main and each agent branch">
        <text className="g-label g-main" x={8} y={MAIN_Y + 4}>main</text>
        <line className="g-main-line" x1={PAD_L} y1={MAIN_Y} x2={Math.max(mainEnd, PAD_L + 4)} y2={MAIN_Y} />
        <circle className="g-base" cx={PAD_L} cy={MAIN_Y} r={4} />

        {tl.tracks.map((track, i) => {
          const y = MAIN_Y + (i + 1) * ROW
          const fx = x(track.assignedAt)
          const merged = mergeX(track.agentId)
          const rejected = decision !== undefined && merged === undefined
          const end = merged ?? x(track.endedAt ?? tl.now)
          const tone = merged !== undefined ? "ok" : rejected ? "rej" : "live"
          const lastLaneX = Math.max(end - (merged !== undefined ? 14 : 0), fx + 14)
          const d = [
            `M ${PAD_L} ${MAIN_Y}`,
            `C ${PAD_L + 10} ${MAIN_Y}, ${fx} ${y}, ${fx + 14} ${y}`,
            `L ${lastLaneX} ${y}`,
            merged !== undefined ? `C ${merged - 4} ${y}, ${merged} ${MAIN_Y + 10}, ${merged} ${MAIN_Y}` : ""
          ].join(" ")
          return (
            <g key={track.agentId} className={`g-branch g-${tone}`}>
              <text className="g-label" x={8} y={y + 4}>{agentName(track.agentId)}</text>
              <path d={d} />
              {track.commits.map((c) => (
                <circle key={c.sha} className="g-commit" cx={Math.max(x(c.at), fx + 14)} cy={y} r={3.5}>
                  <title>{`${c.sha} ${c.message}`}</title>
                </circle>
              ))}
              {rejected && <circle className="g-end" cx={lastLaneX} cy={y} r={3.5} />}
            </g>
          )
        })}

        {tl.mergeAt !== undefined && decision !== undefined && (
          <g className="g-merge">
            <circle cx={x(tl.mergeAt)} cy={MAIN_Y} r={5} />
            <text x={x(tl.mergeAt)} y={MAIN_Y - 10} textAnchor="end">{decision.targetSha}</text>
          </g>
        )}
      </svg>
    </section>
  )
}
