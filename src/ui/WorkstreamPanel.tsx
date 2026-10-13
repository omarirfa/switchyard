import { ArrowRight, ChatCircleDots, Files, GitMerge, Warning } from "@phosphor-icons/react"
import { useMemo } from "react"
import { type Area, areaLabel, areaOf, groupsOf, isHighRisk } from "../domain/Areas.ts"
import type { AgentStatus } from "../domain/Events.ts"
import type { FleetView, Outcome } from "../domain/Fleet.ts"
import { StatusPill } from "./AgentCard.tsx"
import { agentName, ago, clock, full, modeLabel, plural, stateLabel, stateOf } from "./format.ts"
import { SidePanel } from "./SidePanel.tsx"

const STATE_ORDER: ReadonlyArray<AgentStatus | Outcome> = ["working", "testing", "blocked", "queued", "done", "failed", "merged", "rejected"]

// One horizontal bar split by state, with a legend that carries the counts.
export const StateBar = ({ counts, total }: { readonly counts: ReadonlyMap<AgentStatus | Outcome, number>; readonly total: number }) => (
  <div className="statebar-wrap">
    <div className="statebar" role="img" aria-label={STATE_ORDER.map((s) => `${stateLabel(s)} ${counts.get(s) ?? 0}`).join(", ")}>
      {STATE_ORDER.map((s) => {
        const n = counts.get(s) ?? 0
        return n === 0 ? null : <span key={s} className={`sb sb-${s}`} style={{ flexGrow: n / Math.max(1, total) }} />
      })}
    </div>
    <ul className="legend statebar-legend">
      {STATE_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
        <li key={s}>
          <span className={`swatch sbk-${s}`} aria-hidden="true" />
          {stateLabel(s)}
          <b>{full(counts.get(s) ?? 0)}</b>
        </li>
      ))}
    </ul>
  </div>
)

// What one workstream is doing right now: its tasks in progress, the agents working,
// questions waiting on an owner, conflicts, overlapping files, and recent merges.
export const WorkstreamPanel = ({ view, group, onClose, onOpenAgent, onShowAll, onReview }: {
  readonly view: FleetView
  readonly group: string
  readonly onClose: () => void
  readonly onOpenAgent: (id: string) => void
  readonly onShowAll: (group: string) => void
  readonly onReview: (taskId: string) => void
}) => {
  const store = view.store
  const area = areaOf(group)

  const data = useMemo(() => {
    const counts = new Map<AgentStatus | Outcome, number>()
    const working: Array<string> = []
    let agents = 0
    for (const rec of store.agents.values()) {
      if (rec.group !== group) continue
      agents++
      const s = stateOf(rec)
      counts.set(s, (counts.get(s) ?? 0) + 1)
      if (rec.outcome === undefined && (rec.status === "working" || rec.status === "testing" || rec.status === "blocked")) working.push(rec.id)
    }
    working.sort((a, b) => (store.agents.get(b)?.lastAt ?? 0) - (store.agents.get(a)?.lastAt ?? 0))
    const tasks = [...store.tasks.values()]
      .filter((t) => t.group === group && t.decision === undefined && t.agents.length > 0)
      .sort((a, b) => {
        const last = (t: typeof a) => Math.max(...t.agents.map((id) => store.agents.get(id)?.lastAt ?? 0))
        return last(b) - last(a)
      })
    const merges = store.decisions.filter((d) => store.tasks.get(d.taskId)?.group === group).slice(-5).reverse()
    const cards = [...store.cards.values()].filter((c) => c.group === group && c.answeredAt === undefined)
    const conflicts = [...store.conflicts.values()].filter((c) => c.to === undefined && c.file.startsWith(`src/${group}/`))
    const hot = store.hotFiles(200).list.filter((h) => h.file.startsWith(`src/${group}/`)).slice(0, 5)
    return { counts, working, agents, tasks, merges, cards, conflicts, hot }
  }, [view, group])

  return (
    <SidePanel
      labelId="ws-title"
      title={group}
      subtitle={`${areaLabel[area]}, ${plural(data.agents, "agent")}${isHighRisk(group) ? ", high risk" : ""}`}
      badge={isHighRisk(group) ? <span className="risk-tag risk-high">High risk</span> : undefined}
      onClose={onClose}
    >
      <StateBar counts={data.counts} total={data.agents} />

      <section className="drawer-section">
        <h3>Tasks in progress <span className="count-text">{full(data.tasks.length)}</span></h3>
        {data.tasks.length === 0
          ? <p className="quiet">No open tasks in this workstream.</p>
          : (
            <ul className="task-list">
              {data.tasks.slice(0, 8).map((t) => (
                <li key={t.taskId}>
                  <div className="task-line">
                    <span className="task-title">{t.title}</span>
                    <span className={`mode-tag mode-${t.mode}`} title={t.reason}>
                      {modeLabel[t.mode]}{t.mode === "single" ? "" : `, ${t.mode === "parallel" ? plural(t.agents.length, "attempt") : plural(t.agents.length, "subtask")}`}
                    </span>
                  </div>
                  <p className="quiet small task-reason">{t.reason}</p>
                  <div className="task-agents">
                    {t.agents.map((id) => {
                      const rec = store.agents.get(id)
                      return rec && (
                        <button key={id} id={`ws-agent-${id}`} type="button" className={`mini-agent s-${stateOf(rec)}`} onClick={() => onOpenAgent(id)} title={`${agentName(id)}: ${stateLabel(stateOf(rec))}`}>
                          <span className="pill-dot" aria-hidden="true" />
                          {id}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        {data.tasks.length > 8 && <p className="quiet small">{full(data.tasks.length - 8)} more open tasks.</p>}
      </section>

      <section className="drawer-section">
        <h3>Working now <span className="count-text">{full(data.working.length)}</span></h3>
        {data.working.length === 0
          ? <p className="quiet">No agent is working in this workstream right now.</p>
          : (
            <ul className="now-list">
              {data.working.slice(0, 8).map((id) => {
                const rec = store.agents.get(id)!
                return (
                  <li key={id}>
                    <button id={`ws-now-${id}`} type="button" className="now-row" onClick={() => onOpenAgent(id)}>
                      <b>{agentName(id)}</b>
                      <StatusPill state={stateOf(rec)} />
                      <span className="now-note">{rec.note}</span>
                      <span className="quiet">{ago(view.now - rec.lastAt)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      {data.cards.length > 0 && (
        <section className="drawer-section">
          <h3><ChatCircleDots aria-hidden="true" /> Waiting on the owner</h3>
          <ul className="drawer-list">
            {data.cards.map((c) => (
              <li key={c.decisionId}>
                <span className="quiet">{clock(c.askedAt)}</span>
                <div>
                  <p>{c.question}</p>
                  <p className="quiet">Agents continue assuming: {c.assumption}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.conflicts.length > 0 || data.hot.length > 0) && (
        <section className="drawer-section">
          <h3><Warning aria-hidden="true" /> Conflicts and overlaps</h3>
          <ul className="drawer-list">
            {data.conflicts.map((c) => (
              <li key={c.conflictId}>
                <Warning aria-hidden="true" className="warn" />
                <div>
                  <code>{c.file}</code>
                  <p>{c.detail}</p>
                </div>
              </li>
            ))}
            {data.hot.map((h) => (
              <li key={h.file}>
                <Files aria-hidden="true" />
                <div>
                  <code>{h.file}</code>
                  <p className="quiet">{h.units} branches edit this file at once.</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="drawer-section">
        <h3><GitMerge aria-hidden="true" /> Recent merges</h3>
        {data.merges.length === 0
          ? <p className="quiet">Nothing merged here yet.</p>
          : (
            <ol className="recent">
              {data.merges.map((d) => (
                <li key={`${d.taskId}-${d.at}`}>
                  <span className="ev-time">{clock(d.at)}</span>
                  {d.merged.length === 0
                    ? <span className="recent-title">{store.tasks.get(d.taskId)?.title ?? d.taskId}</span>
                    : <button id={`ws-merge-${d.taskId}`} type="button" className="link-btn recent-title" onClick={() => onReview(d.taskId)}>{store.tasks.get(d.taskId)?.title ?? d.taskId}</button>}
                  <span className="quiet">{d.merged.length === 0 ? "nothing merged" : `${d.merged.length} merged`}</span>
                </li>
              ))}
            </ol>
          )}
      </section>

      <button id="ws-show-all" type="button" className="btn" onClick={() => onShowAll(group)}>
        Show all {full(data.agents)} agents in the table
        <ArrowRight aria-hidden="true" />
      </button>
    </SidePanel>
  )
}

// Every product area's workstreams with their live counts, for drilling into one.
export const AreaPanel = ({ view, area, since, onClose, onGroup, onOpenAgent }: {
  readonly view: FleetView
  readonly area: Area | "all"
  readonly since: number
  readonly onClose: () => void
  readonly onGroup: (group: string) => void
  readonly onOpenAgent: (id: string) => void
}) => {
  const store = view.store
  const groups = view.groups
    .filter((g) => area === "all" || areaOf(g.name) === area)
    .slice()
    .sort((a, b) => b.counts.working + b.counts.testing + b.counts.blocked - (a.counts.working + a.counts.testing + a.counts.blocked) || a.name.localeCompare(b.name))
  const sinceMerges = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of store.decisions) {
      if (d.at < since) continue
      const g = store.tasks.get(d.taskId)?.group
      if (g !== undefined) m.set(g, (m.get(g) ?? 0) + d.merged.length)
    }
    return m
  }, [view, since])
  const behaviors = area === "all" ? [] : store.behaviorList.filter((b) => b.area === area).slice(-3).reverse()
  const known = area === "all" ? [] : groupsOf(area).filter((g) => !store.groups.has(g))

  return (
    <SidePanel
      labelId="area-title"
      title={area === "all" ? "All workstreams" : areaLabel[area]}
      subtitle={`${plural(groups.length, "workstream")} with agents`}
      onClose={onClose}
    >
      <ul className="group-list">
        {groups.map((g) => {
          const live = g.counts.working + g.counts.testing + g.counts.blocked
          return (
            <li key={g.name}>
              <button id={`group-${g.name}`} type="button" className="group-row" onClick={() => onGroup(g.name)}>
                <b>{g.name}</b>
                <span className="quiet">{full(live)} of {full(g.agents)} active</span>
                <span className="group-since">{(sinceMerges.get(g.name) ?? 0) > 0 ? `+${full(sinceMerges.get(g.name) ?? 0)} merged since you looked` : ""}</span>
                {g.openConflicts > 0 && <span className="hf-tag warn">{g.openConflicts} conflicts</span>}
                <ArrowRight aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      {known.length > 0 && <p className="quiet small">No agents yet in {known.join(", ")}.</p>}
      {behaviors.length > 0 && (
        <section className="drawer-section">
          <h3>Behavior changes</h3>
          <ul className="drawer-list">
            {behaviors.map((b) => (
              <li key={`${b.taskId}-${b.at}`}>
                <span className="quiet">{clock(b.at)}</span>
                <div>
                  <p>{b.title}</p>
                  <p className="quiet">
                    {b.before} becomes {b.after}.{" "}
                    <button id={`area-beh-${b.taskId}`} type="button" className="link-btn" onClick={() => onOpenAgent(b.agentId)}>{agentName(b.agentId)}</button>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SidePanel>
  )
}
