import { FileCode, GitBranch, GitCommit, GitMerge, Warning, X } from "@phosphor-icons/react"
import { useEffect, useRef } from "react"
import type { FleetView } from "../domain/Fleet.ts"
import type { ReviewSubject } from "../domain/Review.ts"
import { StatusPill } from "./AgentCard.tsx"
import { agentName, ago, clock, describe, modeLabel, plural, stateOf } from "./format.ts"

// Everything one agent did, kept together: plan, steps, commits and files, tests,
// conflicts, the merge verdict, and the other agents on the same task.
export const AgentDrawer = ({ view, agentId, onClose, onOpen, onReview }: {
  readonly view: FleetView
  readonly agentId: string
  readonly onClose: () => void
  readonly onOpen: (id: string) => void
  readonly onReview: (subject: ReviewSubject) => void
}) => {
  const closeRef = useRef<HTMLButtonElement>(null)
  const store = view.store
  const rec = store.agents.get(agentId)
  const task = rec === undefined ? undefined : store.tasks.get(rec.taskId)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [agentId, onClose])

  if (rec === undefined) {
    return (
      <div className="drawer-wrap" onClick={onClose}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-label="Agent details" onClick={(e) => e.stopPropagation()}>
          <header className="drawer-head">
            <h2>{agentName(agentId)}</h2>
            <button ref={closeRef} id="drawer-close" type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </header>
          <p className="quiet">This agent has no events at this point in the run. Move the rewind slider later to see it.</p>
        </aside>
      </div>
    )
  }

  const conflicts = rec.conflicts.flatMap((id) => {
    const c = store.conflicts.get(id)
    return c === undefined ? [] : [c]
  })
  const siblings = (task?.agents ?? []).filter((id) => id !== rec.id)
  const events = rec.events.map((i) => store.log[i]).filter((e) => e !== undefined).reverse()

  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <span className="avatar" aria-hidden="true">{rec.id.slice(-2)}</span>
          <div className="drawer-id">
            <h2 id="drawer-title">{agentName(rec.id)}</h2>
            <p className="branch">
              <GitBranch aria-hidden="true" />
              {rec.branch}
            </p>
          </div>
          <StatusPill state={stateOf(rec)} />
          <button ref={closeRef} id="drawer-close" type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-body">
          <dl className="kv drawer-meta">
            <dt>Workstream</dt>
            <dd>{rec.group}</dd>
            <dt>Task</dt>
            <dd>{task?.title ?? rec.task}</dd>
            {task !== undefined && (
              <>
                <dt>Mode</dt>
                <dd>
                  <span className={`mode-tag mode-${task.mode}`}>{modeLabel[task.mode]}</span>
                  <span className="quiet small mode-reason">{task.reason}</span>
                </dd>
              </>
            )}
            {task?.mode === "split" && (
              <>
                <dt>Subtask</dt>
                <dd>{rec.task}</dd>
              </>
            )}
            <dt>Assigned</dt>
            <dd>{clock(rec.assignedAt)}</dd>
            <dt>Last update</dt>
            <dd>{ago(view.now - rec.lastAt)}</dd>
          </dl>

          <section className="drawer-section">
            <h3>Plan</h3>
            <p>{rec.intent}</p>
            <p className="quiet">Current step: {rec.note === "" ? "Waiting to start" : rec.note}</p>
          </section>

          <section className="drawer-section">
            <div className="drawer-section-head">
              <h3>Commits</h3>
              {rec.commits.length > 0 && (
                <button id="drawer-changes" type="button" className="btn btn-small" onClick={() => onReview({ kind: "branch", agentId: rec.id })}>
                  <FileCode aria-hidden="true" />
                  View branch changes
                </button>
              )}
            </div>
            {rec.commits.length === 0
              ? <p className="quiet">No commits yet.</p>
              : (
                <ol className="drawer-commits">
                  {rec.commits.map((c) => (
                    <li key={c.sha}>
                      <div className="dc-head">
                        <GitCommit aria-hidden="true" />
                        <code>{c.sha}</code>
                        <span>{c.message}</span>
                        <span className="quiet dc-time">{clock(c.at)}</span>
                      </div>
                      <div className="dc-files">
                        {c.files.map((f) => <code key={f} className="file-chip">{f}</code>)}
                        <span className="add">+{c.additions}</span>
                        <span className="del">&minus;{c.deletions}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
          </section>

          <section className="drawer-section">
            <h3>Tests</h3>
            <p>
              {rec.tests === undefined
                ? "Not run yet."
                : rec.tests.failed === 0
                ? `All ${rec.tests.passed} tests pass.`
                : `${rec.tests.failed} of ${rec.tests.passed + rec.tests.failed} tests fail.`}
            </p>
          </section>

          {conflicts.length > 0 && (
            <section className="drawer-section">
              <h3>Conflicts</h3>
              <ul className="drawer-list">
                {conflicts.map((c) => (
                  <li key={c.conflictId}>
                    <Warning aria-hidden="true" className={c.to === undefined ? "warn" : "ok"} />
                    <div>
                      <code>{c.file}</code>
                      <p>{c.detail}</p>
                      {c.resolution !== undefined && <p className="quiet">{c.resolution}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {task?.decision !== undefined && (
            <section className="drawer-section">
              <h3>Merge decision</h3>
              <p className={rec.outcome === "merged" ? "verdict ok" : "verdict"}>
                <GitMerge aria-hidden="true" />
                {rec.outcome === "merged" ? `Merged at ${task.decision.targetSha}` : "Not merged"}
              </p>
              <p className="quiet">{task.decision.reason}</p>
              {task.decision.merged.length > 0 && (
                <button id="drawer-merge-changes" type="button" className="link-btn" onClick={() => onReview({ kind: "merge", taskId: task.taskId })}>
                  <FileCode aria-hidden="true" />
                  {task.decision.merged.length > 1 ? `Code this merge put on main, from ${task.decision.merged.length} agents` : "Code this merge put on main"}
                </button>
              )}
            </section>
          )}

          {siblings.length > 0 && (
            <section className="drawer-section">
              <h3>{task?.mode === "parallel" ? "Competing attempts" : "Other subtasks"}</h3>
              <ul className="sibling-list">
                {siblings.map((id) => {
                  const s = store.agents.get(id)
                  if (s === undefined) return null
                  return (
                    <li key={id}>
                      <button id={`sibling-${id}`} type="button" className="sibling" onClick={() => onOpen(id)}>
                        <b>{agentName(id)}</b>
                        <StatusPill state={stateOf(s)} />
                        <span className="quiet">{plural(s.commits.length, "commit")}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section className="drawer-section">
            <h3>Activity</h3>
            <ol className="drawer-events">
              {events.map((e, i) => (
                <li key={i}>
                  <span className="ev-time">{clock(e!.at)}</span>
                  <span>{describe(e!)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </aside>
    </div>
  )
}
