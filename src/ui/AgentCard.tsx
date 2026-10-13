import { ArrowUpRight, GitBranch, GitCommit, GitMerge, X } from "@phosphor-icons/react"
import type { AgentStatus, TaskMode } from "../domain/Events.ts"
import type { AgentRec, Outcome } from "../domain/Fleet.ts"
import { agentName, stateLabel, stateOf } from "./format.ts"

export const StatusPill = ({ state }: { readonly state: AgentStatus | Outcome }) => (
  <span className={`pill s-${state}`}>
    <span className="pill-dot" aria-hidden="true" />
    {stateLabel(state)}
  </span>
)

const TestTicks = ({ tests }: { readonly tests: NonNullable<AgentRec["tests"]> }) => {
  const total = tests.passed + tests.failed
  const label = `${tests.passed} of ${total} tests passed`
  if (total > 48) {
    return (
      <div className="testbar" role="img" aria-label={label}>
        <span className="t-pass" style={{ flexGrow: tests.passed }} />
        {tests.failed > 0 && <span className="t-fail" style={{ flexGrow: tests.failed }} />}
      </div>
    )
  }
  return (
    <div className="ticks" role="img" aria-label={label}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < tests.passed ? "t-pass" : "t-fail"} />)}
    </div>
  )
}

// Full card for runs small enough to compare agents side by side. Fleets use the table.
export const AgentCard = ({ rec, mode, onOpen }: {
  readonly rec: AgentRec
  readonly mode: TaskMode | undefined
  readonly onOpen: (id: string) => void
}) => {
  const state = stateOf(rec)
  const live = rec.outcome === undefined && (rec.status === "working" || rec.status === "testing")

  return (
    <article className={`agent a-${rec.status}${rec.outcome ? ` o-${rec.outcome}` : ""}`}>
      <header className="agent-head">
        <span className="avatar" aria-hidden="true">{rec.id}</span>
        <div className="agent-id">
          <h3>{agentName(rec.id)}</h3>
          <p className="branch">
            <GitBranch aria-hidden="true" />
            {rec.branch}
          </p>
        </div>
        <StatusPill state={state} />
      </header>

      <div className="slot">
        {mode === "split" && (
          <div className="field">
            <span className="label">Subtask</span>
            <p className="subtask">{rec.task}</p>
          </div>
        )}
      </div>

      <div className="field">
        <span className="label">Plan</span>
        <p>{rec.intent}</p>
      </div>

      <div className={live ? "now live" : "now"}>
        <span className="label">Current step</span>
        <p>{rec.note === "" ? "Waiting to start" : rec.note}</p>
      </div>

      <dl className="agent-metrics">
        <div>
          <dt>Commits</dt>
          <dd>{rec.commits.length}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>
            <span className="add">+{rec.additions}</span> <span className="del">&minus;{rec.deletions}</span>
          </dd>
        </div>
        <div>
          <dt>Tests</dt>
          <dd>{rec.tests ? `${rec.tests.passed}/${rec.tests.passed + rec.tests.failed}` : "Not run"}</dd>
        </div>
      </dl>

      <div className="slot">{rec.tests && <TestTicks tests={rec.tests} />}</div>

      <div className="slot">
        {rec.commits.length > 0 && (
          <ol className="commits" aria-label="Commits">
            {rec.commits.map((c) => (
              <li key={c.sha}>
                <GitCommit aria-hidden="true" />
                <code>{c.sha}</code>
                <span>{c.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="slot">
        <footer className="agent-foot">
          {rec.outcome && (
            <span className={`outcome oc-${rec.outcome}`}>
              {rec.outcome === "merged" ? <GitMerge aria-hidden="true" /> : <X aria-hidden="true" />}
              {rec.outcome === "merged" ? "Merged into main" : "Not merged"}
            </span>
          )}
          <button id={`open-${rec.id}`} type="button" className="link-btn" onClick={() => onOpen(rec.id)}>
            Details
            <ArrowUpRight aria-hidden="true" />
          </button>
        </footer>
      </div>
    </article>
  )
}
