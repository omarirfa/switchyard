import type { FleetView } from "../domain/Fleet.ts"
import { clock, compact, full, pct } from "./format.ts"

// A 12-point-or-more sparkline of active agents, drawn in the de-emphasis colour
// with the latest point in the accent.
const Spark = ({ view }: { readonly view: FleetView }) => {
  const pts = view.history.slice(-48).map((h) => h.counts.working + h.counts.testing + h.counts.blocked)
  pts.push(view.active + view.counts.blocked)
  if (pts.length < 3) return null
  const max = Math.max(1, ...pts)
  const w = 96
  const h = 24
  const xy = pts.map((p, i) => [(i / (pts.length - 1)) * w, h - 2 - (p / max) * (h - 4)] as const)
  const last = xy[xy.length - 1]!
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`M${xy.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}`} />
      <circle cx={last[0]} cy={last[1]} r={2.5} />
    </svg>
  )
}

export const Kpis = ({ view, now }: { readonly view: FleetView; readonly now: number }) => {
  const live = view.active + view.counts.blocked
  return (
    <dl className="kpis" aria-live="polite">
      <div className="kpi-wide">
        <dt>Active agents</dt>
        <dd>
          <span className="kpi-value">{compact(live)}</span>
          <small>of {compact(view.agents)}</small>
          <Spark view={view} />
        </dd>
      </div>
      <div>
        <dt>Commits</dt>
        <dd>
          <span className="kpi-value">{compact(view.commits)}</span>
          <small>
            <span className="add">+{compact(view.additions)}</span> <span className="del">&minus;{compact(view.deletions)}</span>
          </small>
        </dd>
      </div>
      <div>
        <dt>Tests passed</dt>
        <dd>
          {view.testsTotal === 0
            ? <span className="kpi-value kpi-none">None yet</span>
            : (
              <>
                <span className="kpi-value">{pct(view.testsPassed, view.testsTotal)}</span>
                <small>of {compact(view.testsTotal)}</small>
              </>
            )}
        </dd>
      </div>
      <div>
        <dt>Tasks decided</dt>
        <dd>
          <span className="kpi-value">{full(view.decided)}</span>
          <small>of {full(view.tasks)}</small>
        </dd>
      </div>
      <div>
        <dt>Open conflicts</dt>
        <dd className={view.openConflicts > 0 ? "warn" : undefined}>
          <span className="kpi-value">{full(view.openConflicts)}</span>
          <small>{full(view.conflictsTotal)} total</small>
        </dd>
      </div>
      <div>
        <dt>Elapsed</dt>
        <dd>
          <span className="kpi-value">{clock(now)}</span>
        </dd>
      </div>
    </dl>
  )
}
