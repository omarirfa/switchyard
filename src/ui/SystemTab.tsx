import { ArrowRight, ArrowsLeftRight, CalendarDots, Eye, FileCode } from "@phosphor-icons/react"
import { useMemo } from "react"
import { type Area, AREAS, areaLabel, areaOf } from "../domain/Areas.ts"
import type { FleetView } from "../domain/Fleet.ts"
import { agentName, clock, full, plural } from "./format.ts"


interface AreaNow {
  readonly area: Area
  readonly mergesSince: number
  readonly merges: number
  readonly live: number
  readonly agents: number
  readonly open: number
  readonly conflicts: number
  readonly behaviors: number
  readonly reverts: number
}

// Per area: what changed since the marker, and what is waiting on a person now.
const summarize = (view: FleetView, since: number): ReadonlyArray<AreaNow> => {
  const store = view.store
  const from = Math.floor(since / view.timelineBucketMs)
  const reverts = new Map<Area, number>()
  for (const e of store.log) {
    if (e._tag === "MergeReverted" && e.at >= since) {
      const a = areaOf(store.tasks.get(e.taskId)?.group ?? "")
      reverts.set(a, (reverts.get(a) ?? 0) + 1)
    }
  }
  return AREAS.map((area) => {
    const st = view.areas.find((s) => s.area === area)
    const groups = view.groups.filter((g) => areaOf(g.name) === area)
    return {
      area,
      mergesSince: st === undefined ? 0 : st.buckets.slice(from).reduce((s, n) => s + n, 0),
      merges: st?.merges ?? 0,
      live: groups.reduce((s, g) => s + g.counts.working + g.counts.testing + g.counts.blocked, 0),
      agents: groups.reduce((s, g) => s + g.agents, 0),
      open: view.owners.find((o) => o.area === area)?.open ?? 0,
      conflicts: groups.reduce((s, g) => s + g.openConflicts, 0),
      behaviors: store.behaviorList.filter((b) => b.area === area && b.at >= since).length,
      reverts: reverts.get(area) ?? 0
    }
  })
}

export const SinceLooked = ({ view, since, onMark, onReset, onArea }: {
  readonly view: FleetView
  readonly since: number
  readonly onMark: () => void
  readonly onReset: () => void
  readonly onArea: (a: Area) => void
}) => {
  const rows = useMemo(() => summarize(view, since), [view, since])
  const buckets = Math.max(1, ...view.areas.map((a) => a.buckets.length))
  const peak = Math.max(1, ...view.areas.flatMap((a) => a.buckets))
  const sinceX = (since / view.timelineBucketMs / buckets) * 100
  const total = rows.reduce((s, r) => s + r.mergesSince, 0)
  const behaviors = rows.reduce((s, r) => s + r.behaviors, 0)
  const reverts = rows.reduce((s, r) => s + r.reverts, 0)
  return (
    <section className="panel" aria-labelledby="since-title">
      <header className="panel-head">
        <h2 id="since-title"><CalendarDots aria-hidden="true" /> Since you last looked</h2>
        <div className="head-actions">
          {since > 0 && <button id="since-reset" type="button" className="btn btn-quiet btn-small" onClick={onReset}>Show whole run</button>}
          <button id="since-mark" type="button" className="btn btn-small" onClick={onMark}>Mark all as seen</button>
        </div>
      </header>
      <p className="since-sum">
        {since === 0 ? "Since the run started: " : `Since ${clock(since)}: `}
        <b>{plural(total, "merge")}</b>, <b>{plural(behaviors, "behavior change")}</b>, <b>{plural(reverts, "revert")}</b>.
      </p>
      <ul className="since-rows">
        {rows.map((r) => {
          const st = view.areas.find((a) => a.area === r.area)
          return (
            <li key={r.area}>
              <button id={`since-${r.area}`} type="button" className="since-row" onClick={() => onArea(r.area)}>
                <span className="since-name">{areaLabel[r.area]}</span>
                <span className="since-strip" aria-hidden="true">
                  {Array.from({ length: buckets }, (_, i) => {
                    const n = st?.buckets[i] ?? 0
                    return <span key={i} className={(i + 1) * view.timelineBucketMs > since ? "stick stick-new" : "stick"} style={{ height: `${n === 0 ? 0 : 12 + (88 * n) / peak}%` }} />
                  })}
                  {since > 0 && <span className="since-mark" style={{ left: `${Math.min(100, sinceX)}%` }} />}
                </span>
                <span className="since-n">+{full(r.mergesSince)}</span>
                <span className="quiet since-extra">
                  {[r.behaviors > 0 ? plural(r.behaviors, "behavior change") : "", r.reverts > 0 ? plural(r.reverts, "revert") : ""].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="quiet small">Bars show merges per {view.timelineBucketMs / 1000} seconds of run time. This browser keeps the marker for the current sample.</p>
    </section>
  )
}

// Parallel workstreams can ship the same user-facing change. One card per change.
const groupBehaviors = (list: FleetView["behaviors"]) => {
  const out = new Map<string, { b: FleetView["behaviors"][number]; count: number }>()
  for (const b of list) {
    const key = `${b.title}|${b.after}`
    const g = out.get(key)
    if (g === undefined) out.set(key, { b, count: 1 })
    else g.count++
  }
  return [...out.values()]
}

export const BehaviorCards = ({ view, onOpen, onReview }: { readonly view: FleetView; readonly onOpen: (id: string) => void; readonly onReview: (taskId: string) => void }) => (
  <section className="panel" aria-labelledby="beh-title">
    <header className="panel-head">
      <h2 id="beh-title"><ArrowsLeftRight aria-hidden="true" /> Behavior changes</h2>
      <span className="count-text">from the latest {view.behaviors.length} merges</span>
    </header>
    <p className="quiet small">Merges that change what a user sees, written as before and after with the request and contract behind each one.</p>
    {view.behaviors.length === 0
      ? <p className="quiet">No merge has changed user-facing behavior yet.</p>
      : (
        <div className="beh-grid">
          {groupBehaviors(view.behaviors).map(({ b, count }) => (
            <article key={`${b.taskId}-${b.at}`} className="beh">
              <header className="dcard-head">
                <span className="chip">{areaLabel[b.area]}</span>
                <span className="quiet dcard-age">{clock(b.at)}</span>
              </header>
              <h3>{b.title}</h3>
              <dl className="beh-diff">
                <dt>Before</dt>
                <dd>{b.before}</dd>
                <dt>After</dt>
                <dd className="beh-after">{b.after}</dd>
              </dl>
              <dl className="kv small">
                <dt>Request</dt>
                <dd>{b.request}</dd>
                <dt>Contract</dt>
                <dd>{b.contract}</dd>
              </dl>
              <p className="beh-foot">
                {count > 1 && <span className="quiet">{count} merges made this change. Latest by </span>}
                <button id={`beh-${b.taskId}`} type="button" className="link-btn" onClick={() => onOpen(b.agentId)}>
                  {agentName(b.agentId)}
                  <ArrowRight aria-hidden="true" />
                </button>
              </p>
              <button id={`beh-code-${b.taskId}`} type="button" className="btn btn-small beh-code" onClick={() => onReview(b.taskId)}>
                <FileCode aria-hidden="true" />
                View the code change
              </button>
            </article>
          ))}
        </div>
      )}
  </section>
)

// Churn is merges per area. Attention is how many times this browser opened that area
// or one of its workstreams in the current session.
export const ChurnAttention = ({ view, views, onArea }: {
  readonly view: FleetView
  readonly views: ReadonlyMap<Area, number>
  readonly onArea: (a: Area) => void
}) => {
  const rows = AREAS.map((a) => ({ area: a, merges: view.areas.find((s) => s.area === a)?.merges ?? 0, seen: views.get(a) ?? 0 }))
    .sort((a, b) => b.merges - a.merges)
  const maxM = Math.max(1, ...rows.map((r) => r.merges))
  const maxV = Math.max(1, ...rows.map((r) => r.seen))
  const unseen = rows.filter((r) => r.merges > 0 && r.seen === 0)
  return (
    <section className="panel" aria-labelledby="churn-title">
      <header className="panel-head">
        <h2 id="churn-title"><Eye aria-hidden="true" /> Churn and attention</h2>
        <span className="count-text">{unseen.length} changed areas not opened yet</span>
      </header>
      <table className="churn">
        <caption className="sr-only">Merges and views per product area</caption>
        <thead>
          <tr>
            <th scope="col">Area</th>
            <th scope="col">Merges</th>
            <th scope="col">Your views</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.area} className={r.merges > 0 && r.seen === 0 ? "churn-gap" : undefined}>
              <th scope="row">
                <button id={`churn-${r.area}`} type="button" className="link-btn" onClick={() => onArea(r.area)}>{areaLabel[r.area]}</button>
              </th>
              <td>
                <span className="cbar cbar-m" style={{ width: `${(r.merges / maxM) * 100}%` }} aria-hidden="true" />
                <span className="cnum">{full(r.merges)}</span>
              </td>
              <td>
                <span className="cbar cbar-v" style={{ width: `${(r.seen / maxV) * 100}%` }} aria-hidden="true" />
                <span className="cnum">{r.seen === 0 ? "Not opened" : full(r.seen)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="quiet small">Views count the area and workstream panels opened in this browser session. Nothing leaves the page.</p>
    </section>
  )
}
