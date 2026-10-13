import { Check, Circle, Flask, GitBranch, GitCommit, GitMerge, ListBullets, Play, Plus, Warning } from "@phosphor-icons/react"
import { useState } from "react"
import type { CoordinationEvent } from "../domain/Events.ts"
import { agentName, clock, describe, eventAgent, full } from "./format.ts"

type Filter = "all" | "commits" | "tests" | "conflicts" | "status"

const filters: ReadonlyArray<{ readonly id: Filter; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "status", label: "Status" },
  { id: "commits", label: "Commits" },
  { id: "tests", label: "Tests" },
  { id: "conflicts", label: "Conflicts" }
]

const kind = (e: CoordinationEvent): Exclude<Filter, "all"> => {
  switch (e._tag) {
    case "CommitPushed":
    case "MergeDecided":
      return "commits"
    case "TestsFinished":
      return "tests"
    case "ConflictDetected":
    case "ConflictResolved":
      return "conflicts"
    default:
      return "status"
  }
}

const Icon = ({ event }: { readonly event: CoordinationEvent }) => {
  const p = { "aria-hidden": true } as const
  switch (event._tag) {
    case "RunStarted":
      return <Play {...p} />
    case "TaskCreated":
      return <Plus {...p} />
    case "AgentAssigned":
      return <GitBranch {...p} />
    case "AgentStatusChanged":
      return <Circle {...p} />
    case "CommitPushed":
      return <GitCommit {...p} />
    case "TestsFinished":
      return <Flask {...p} />
    case "ConflictDetected":
      return <Warning {...p} />
    case "ConflictResolved":
      return <Check {...p} />
    case "MergeDecided":
      return <GitMerge {...p} />
  }
}

const tone = (e: CoordinationEvent): string => {
  switch (e._tag) {
    case "ConflictDetected":
      return "warn"
    case "ConflictResolved":
    case "MergeDecided":
      return "ok"
    case "TestsFinished":
      return e.failed > 0 ? "bad" : "ok"
    case "AgentStatusChanged":
      return e.status === "failed" ? "bad" : e.status === "blocked" ? "warn" : e.status === "done" ? "ok" : "plain"
    default:
      return "plain"
  }
}

// The live tail. At fleet scale the full log runs to hundreds of thousands of events,
// so the panel keeps the latest 200 and the drawer holds each agent's full history.
export const EventLog = ({ log, total, onOpen }: {
  readonly log: ReadonlyArray<CoordinationEvent>
  readonly total: number
  readonly onOpen: (id: string) => void
}) => {
  const [filter, setFilter] = useState<Filter>("all")
  const counts = log.reduce<Record<Filter, number>>(
    (acc, e) => ({ ...acc, all: acc.all + 1, [kind(e)]: acc[kind(e)] + 1 }),
    { all: 0, commits: 0, tests: 0, conflicts: 0, status: 0 }
  )
  const rows = log.map((e, i) => ({ e, i })).filter(({ e }) => filter === "all" || kind(e) === filter).reverse()

  return (
    <section className="panel log" aria-labelledby="log-title">
      <header className="panel-head">
        <h2 id="log-title">
          <ListBullets aria-hidden="true" />
          Event log
          {total > log.length && <span className="count-text">latest {full(log.length)} of {full(total)}</span>}
        </h2>
        <div className="filters" role="tablist" aria-label="Filter events">
          {filters.map((f) => (
            <button
              key={f.id}
              id={`filter-${f.id}`}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? "filter on" : "filter"}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="filter-count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </header>
      <div className="log-scroll">
        {rows.length === 0
          ? <p className="quiet log-empty">No events of this type yet.</p>
          : (
            <ol className="events">
              {rows.map(({ e, i }) => {
                const agent = eventAgent(e)
                return (
                  <li key={total - log.length + i} className={`ev ev-${tone(e)}`}>
                    <span className="ev-time">{clock(e.at)}</span>
                    <span className="ev-icon"><Icon event={e} /></span>
                    {agent
                      ? <button type="button" className="ev-agent link-btn" onClick={() => onOpen(agent)}>{agentName(agent)}</button>
                      : <span className="ev-agent">Coordinator</span>}
                    <span className="ev-text">{describe(e)}</span>
                  </li>
                )
              })}
            </ol>
          )}
      </div>
    </section>
  )
}
