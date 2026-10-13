import { Branches } from "@lucasmarkes/hairline/react"
import { Check, FileCode, Files, GitMerge, Warning, X } from "@phosphor-icons/react"
import type { FleetView } from "../domain/Fleet.ts"
import { agentName, clock, full, joinAgents } from "./format.ts"

export const Decisions = ({ view, running, onOpen, onReview }: {
  readonly view: FleetView
  readonly running: boolean
  readonly onOpen: (id: string) => void
  readonly onReview: (taskId: string) => void
}) => {
  const store = view.store
  const latest = view.decisions[0]
  const latestTask = latest === undefined ? undefined : store.tasks.get(latest.taskId)
  return (
    <section id="decisions" className={latest ? "panel decision decided" : "panel decision"} aria-labelledby="decision-title">
      <header className="panel-head">
        <h2 id="decision-title">
          <GitMerge aria-hidden="true" />
          Merge decisions
        </h2>
        {view.tasks > 1 && <span className="count-text">{full(view.decided)} of {full(view.tasks)} tasks</span>}
      </header>
      {latest === undefined
        ? (
          <div className="pending">
            <div className="hairline-plate pending-figure">
              <Branches className="figure" play={running} intensity={0.6} label="Branches waiting to merge into main" />
            </div>
            <p className="quiet">The coordinator merges a task once all of its agents finish their tests.</p>
          </div>
        )
        : (
          <>
            <div className="target">
              <span className="label">{view.tasks > 1 ? `Latest: ${latestTask?.title ?? latest.taskId}` : "New commit on main"}</span>
              <code>{latest.merged.length === 0 ? "Nothing merged" : latest.targetSha}</code>
            </div>
            <ul className="verdicts">
              {latest.merged.map((id, i) => (
                <li key={id} className="v-merged">
                  <GitMerge aria-hidden="true" />
                  <button id={`verdict-${id}`} type="button" className="link-btn" onClick={() => onOpen(id)}>{agentName(id)}</button>
                  <span className="v-note">{latest.merged.length > 1 ? `Merge ${i + 1} of ${latest.merged.length}` : "Merged"}</span>
                </li>
              ))}
              {latest.rejected.slice(0, 4).map((id) => (
                <li key={id} className="v-rejected">
                  <X aria-hidden="true" />
                  <button id={`verdict-${id}`} type="button" className="link-btn" onClick={() => onOpen(id)}>{agentName(id)}</button>
                  <span className="v-note">Not merged</span>
                </li>
              ))}
            </ul>
            <p className="reason">{latest.reason}</p>
            {latest.merged.length > 0 && (
              <button id="decision-changes" type="button" className="btn btn-small" onClick={() => onReview(latest.taskId)}>
                <FileCode aria-hidden="true" />
                View code changes
              </button>
            )}
            {view.decisions.length > 1 && (
              <ol className="recent" aria-label="Earlier decisions">
                {view.decisions.slice(1, 5).map((d) => (
                  <li key={`${d.taskId}-${d.at}`}>
                    <span className="ev-time">{clock(d.at)}</span>
                    {d.merged.length === 0
                      ? <span className="recent-title">{store.tasks.get(d.taskId)?.title ?? d.taskId}</span>
                      : <button id={`recent-${d.taskId}`} type="button" className="link-btn recent-title" onClick={() => onReview(d.taskId)}>{store.tasks.get(d.taskId)?.title ?? d.taskId}</button>}
                    <span className="quiet">{d.merged.length === 0 ? "nothing merged" : `${d.merged.length} merged`}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
    </section>
  )
}

// Early warning: files that branches from different merge units edit at the same time.
// Competing attempts on one parallel task do not count, since only one of them merges.
export const Overlap = ({ view, onFile }: { readonly view: FleetView; readonly onFile: (file: string) => void }) => (
  <section id="overlap" className="panel" aria-labelledby="overlap-title" tabIndex={-1}>
    <header className="panel-head">
      <h2 id="overlap-title">
        <Files aria-hidden="true" />
        Overlap warnings
      </h2>
      {view.overlapFiles > 0 && <span className="count-text">{full(view.overlapFiles)} files</span>}
    </header>
    {view.hotFiles.length === 0
      ? <p className="quiet">No file is open in two branches that will both merge.</p>
      : (
        <ul className="hot-files">
          {view.hotFiles.map((h) => (
            <li key={h.file} className={h.conflict ? "hf hf-conflict" : "hf"}>
              <button id={`hot-${h.file}`} type="button" className="hf-btn" onClick={() => onFile(h.file)}>
                <code className="file">{h.file}</code>
                <span className="hf-meta">
                  <span className={h.conflict ? "hf-tag warn" : "hf-tag"}>{h.conflict ? "Conflict" : "Overlap"}</span>
                  <span className="quiet">
                    {h.agents.length <= 3 ? joinAgents(h.agents) : `${h.units} branches, ${h.agents.length} agents`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    {view.overlapFiles > view.hotFiles.length && (
      <p className="quiet small">Showing the {view.hotFiles.length} busiest of {full(view.overlapFiles)} files. Select a file to list its agents.</p>
    )}
  </section>
)

export const Conflicts = ({ view, onOpen }: { readonly view: FleetView; readonly onOpen: (id: string) => void }) => (
  <section id="conflicts" className="panel" aria-labelledby="conflicts-title" tabIndex={-1}>
    <header className="panel-head">
      <h2 id="conflicts-title">
        <Warning aria-hidden="true" />
        Conflicts
      </h2>
      {view.openConflicts > 0 && <span className="count warn">{full(view.openConflicts)} open</span>}
    </header>
    {view.conflictsTotal === 0
      ? <p className="quiet">No conflicts in this run.</p>
      : (
        <ul className="conflicts">
          {[...view.openConflictList, ...view.resolvedConflictList].slice(0, 5).map((c) => (
            <li key={c.conflictId} className={c.to === undefined ? "c-open" : "c-done"}>
              <code className="file">{c.file}</code>
              <div className="chips">
                {c.agentIds.map((id) => (
                  <button key={id} id={`conflict-${c.conflictId}-${id}`} type="button" className="chip" onClick={() => onOpen(id)}>
                    {agentName(id)}
                  </button>
                ))}
              </div>
              <p>{c.detail}</p>
              {c.resolution !== undefined && (
                <p className="resolution">
                  <Check aria-hidden="true" />
                  <span>{c.resolution}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    {view.conflictsTotal > 5 && (
      <p className="quiet small">{full(view.conflictsTotal - view.openConflicts)} resolved so far.</p>
    )}
  </section>
)
