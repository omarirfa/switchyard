import { CaretRight, MagnifyingGlass, UsersThree, X } from "@phosphor-icons/react"
import { useMemo, useRef, useState } from "react"
import type { AgentStatus } from "../domain/Events.ts"
import type { FleetView, Outcome, SortKey } from "../domain/Fleet.ts"
import { AgentCard, StatusPill } from "./AgentCard.tsx"
import { ago, compact, full, stateOf } from "./format.ts"

export interface AgentFilter {
  readonly search: string
  readonly statuses: ReadonlySet<AgentStatus | Outcome>
  readonly group: string | undefined
  readonly ids: { readonly label: string; readonly set: ReadonlySet<string> } | undefined
  readonly sort: SortKey
}

export const emptyFilter: AgentFilter = { search: "", statuses: new Set(), group: undefined, ids: undefined, sort: "activity" }

const CHIPS: ReadonlyArray<{ readonly key: AgentStatus | Outcome; readonly label: string }> = [
  { key: "working", label: "Working" },
  { key: "testing", label: "Testing" },
  { key: "blocked", label: "Blocked" },
  { key: "failed", label: "Failed" },
  { key: "queued", label: "Queued" },
  { key: "done", label: "Awaiting merge" },
  { key: "merged", label: "Merged" },
  { key: "rejected", label: "Not merged" }
]

const SORTS: ReadonlyArray<{ readonly key: SortKey; readonly label: string }> = [
  { key: "activity", label: "Latest activity" },
  { key: "failing", label: "Problems first" },
  { key: "commits", label: "Most commits" },
  { key: "lines", label: "Most lines changed" },
  { key: "id", label: "Assignment order" }
]

// Cards show every detail and suit a handful of agents. Past this, the table takes over.
export const CARDS_MAX = 6
const ROW = 44
const VIEWPORT = 528

const VirtualTable = ({ view, ids, onOpen }: {
  readonly view: FleetView
  readonly ids: ReadonlyArray<string>
  readonly onOpen: (id: string) => void
}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 6)
  const last = Math.min(ids.length, Math.ceil((scrollTop + VIEWPORT) / ROW) + 6)
  const store = view.store

  return (
    <div className="vtable" role="table" aria-label="Agents" aria-rowcount={ids.length + 1}>
      <div className="vrow vhead" role="row" aria-rowindex={1}>
        <span role="columnheader">Agent</span>
        <span role="columnheader">State</span>
        <span role="columnheader" className="c-task">Task</span>
        <span role="columnheader" className="c-num">Commits</span>
        <span role="columnheader" className="c-num c-lines">Lines</span>
        <span role="columnheader" className="c-num c-tests">Tests</span>
        <span role="columnheader" className="c-num c-ago">Last update</span>
        <span role="columnheader" className="sr-only">Open</span>
      </div>
      <div
        ref={ref}
        className="vbody"
        style={{ height: Math.min(VIEWPORT, Math.max(ROW, ids.length * ROW)) }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        role="rowgroup"
      >
        <div style={{ height: ids.length * ROW, position: "relative" }}>
          {ids.slice(first, last).map((id, k) => {
            const rec = store.agents.get(id)
            if (rec === undefined) return null
            const i = first + k
            return (
              <div
                key={id}
                className="vrow"
                role="row"
                aria-rowindex={i + 2}
                tabIndex={0}
                style={{ transform: `translateY(${i * ROW}px)` }}
                onClick={() => onOpen(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onOpen(id)
                  }
                }}
              >
                <span role="cell" className="c-agent">
                  <b>{rec.id}</b>
                  <span className="quiet">{rec.group}</span>
                </span>
                <span role="cell"><StatusPill state={stateOf(rec)} /></span>
                <span role="cell" className="c-task" title={rec.task}>{rec.task}</span>
                <span role="cell" className="c-num">{rec.commits.length}</span>
                <span role="cell" className="c-num c-lines">
                  <span className="add">+{rec.additions}</span> <span className="del">&minus;{rec.deletions}</span>
                </span>
                <span role="cell" className={rec.tests && rec.tests.failed > 0 ? "c-num c-tests bad" : "c-num c-tests"}>
                  {rec.tests ? `${rec.tests.passed}/${rec.tests.passed + rec.tests.failed}` : "None"}
                </span>
                <span role="cell" className="c-num c-ago">{ago(view.now - rec.lastAt)}</span>
                <span role="cell" className="c-go"><CaretRight aria-hidden="true" /></span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const Agents = ({ view, filter, onFilter, onOpen }: {
  readonly view: FleetView
  readonly filter: AgentFilter
  readonly onFilter: (f: AgentFilter) => void
  readonly onOpen: (id: string) => void
}) => {
  const store = view.store
  const ids = useMemo(
    () => store.query({ search: filter.search, statuses: filter.statuses, group: filter.group, ids: filter.ids?.set, sort: filter.sort }),
    [view, filter]
  )
  const stateCounts = useMemo(() => {
    const c = new Map<AgentStatus | Outcome, number>()
    for (const rec of store.agents.values()) {
      const k = stateOf(rec)
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [view])
  const chipCount = (k: AgentStatus | Outcome) => stateCounts.get(k) ?? 0
  const cards = view.agents <= CARDS_MAX
  const filtered = filter.search !== "" || filter.statuses.size > 0 || filter.group !== undefined || filter.ids !== undefined
  const toggle = (k: AgentStatus | Outcome) => {
    const next = new Set(filter.statuses)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    onFilter({ ...filter, statuses: next })
  }
  const taskMode = (id: string) => store.tasks.get(store.agents.get(id)?.taskId ?? "")?.mode

  return (
    <section id="agents" className="panel agents-panel" aria-labelledby="agents-title">
      <header className="panel-head">
        <h2 id="agents-title">
          <UsersThree aria-hidden="true" />
          Agents
        </h2>
        <span className="count-text">
          {filtered ? `${full(ids.length)} of ${full(view.agents)}` : `${full(view.agents)} total`}
        </span>
      </header>

      {!cards && (
        <div className="toolbar">
          <label className="search" htmlFor="agent-search">
            <MagnifyingGlass aria-hidden="true" />
            <span className="sr-only">Search agents</span>
            <input
              id="agent-search"
              type="search"
              placeholder="Agent, workstream, task, branch, or file"
              value={filter.search}
              onChange={(e) => onFilter({ ...filter, search: e.currentTarget.value })}
            />
          </label>
          <label className="select" htmlFor="agent-group">
            <span className="sr-only">Workstream</span>
            <select
              id="agent-group"
              value={filter.group ?? ""}
              onChange={(e) => onFilter({ ...filter, group: e.currentTarget.value === "" ? undefined : e.currentTarget.value })}
            >
              <option value="">All workstreams</option>
              {[...view.groups].sort((a, b) => a.name.localeCompare(b.name)).map((g) => (
                <option key={g.name} value={g.name}>{g.name} ({full(g.agents)})</option>
              ))}
            </select>
          </label>
          <label className="select" htmlFor="agent-sort">
            <span className="sr-only">Sort</span>
            <select id="agent-sort" value={filter.sort} onChange={(e) => onFilter({ ...filter, sort: e.currentTarget.value as SortKey })}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="chips-row" role="group" aria-label="Filter by state">
            {CHIPS.map((c) => (
              <button
                key={c.key}
                id={`chip-${c.key}`}
                type="button"
                className={filter.statuses.has(c.key) ? `fchip on s-${c.key}` : `fchip s-${c.key}`}
                aria-pressed={filter.statuses.has(c.key)}
                onClick={() => toggle(c.key)}
              >
                <span className="pill-dot" aria-hidden="true" />
                {c.label}
                <span className="fchip-count">{compact(Math.max(0, chipCount(c.key)))}</span>
              </button>
            ))}
          </div>
          {filter.ids && (
            <span className="scope">
              {filter.ids.label}
              <button id="clear-scope" type="button" aria-label="Clear this filter" onClick={() => onFilter({ ...filter, ids: undefined })}>
                <X aria-hidden="true" />
              </button>
            </span>
          )}
          {filtered && (
            <button id="clear-filters" type="button" className="link-btn" onClick={() => onFilter({ ...emptyFilter, sort: filter.sort })}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {view.agents === 0
        ? <p className="empty">Agents appear here when the coordinator assigns each one a branch.</p>
        : cards
        ? (
          <div className="agent-cards">
            {store.order.map((id) => {
              const rec = store.agents.get(id)
              return rec && <AgentCard key={id} rec={rec} mode={taskMode(id)} onOpen={onOpen} />
            })}
          </div>
        )
        : ids.length === 0
        ? <p className="empty">No agents match these filters.</p>
        : <VirtualTable view={view} ids={ids} onOpen={onOpen} />}
    </section>
  )
}
