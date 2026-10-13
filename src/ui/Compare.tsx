import { Scales, Trophy } from "@phosphor-icons/react"
import { useMemo } from "react"
import type { FleetView } from "../domain/Fleet.ts"
import { StatusPill } from "./AgentCard.tsx"
import { agentName, clock, full, modeLabel, stateOf } from "./format.ts"

// Side by side view of the attempts on one parallel task, with the coordinator's pick.
// At fleet scale the picker lists the most recent tasks; any agent's details also link here.
// Recently decided parallel tasks first (newest decision first), then tasks still in progress.
export const parallelTasks = (view: FleetView): ReadonlyArray<string> => {
  const store = view.store
  const out: Array<string> = []
  const seen = new Set<string>()
  for (let i = store.decisions.length - 1; i >= 0 && out.length < 20; i--) {
    const t = store.tasks.get(store.decisions[i]!.taskId)
    if (t !== undefined && t.mode === "parallel" && t.agents.length >= 2 && !seen.has(t.taskId)) {
      out.push(t.taskId)
      seen.add(t.taskId)
    }
  }
  for (let i = store.taskOrder.length - 1; i >= 0 && out.length < 40; i--) {
    const t = store.tasks.get(store.taskOrder[i]!)
    if (t !== undefined && t.mode === "parallel" && t.agents.length >= 2 && !seen.has(t.taskId)) {
      out.push(t.taskId)
      seen.add(t.taskId)
    }
  }
  return out
}

export const Compare = ({ view, taskId, onTask, onOpen, onReview }: {
  readonly view: FleetView
  readonly taskId: string | undefined
  readonly onTask: (id: string) => void
  readonly onOpen: (id: string) => void
  readonly onReview: (agentId: string) => void
}) => {
  const store = view.store
  const options = useMemo(() => parallelTasks(view), [view])
  const chosen = taskId !== undefined && store.tasks.has(taskId) ? taskId : options[0]
  const task = chosen === undefined ? undefined : store.tasks.get(chosen)
  if (task === undefined) return null
  const attempts = task.agents.flatMap((id) => {
    const r = store.agents.get(id)
    return r === undefined ? [] : [r]
  })
  const winner = task.decision?.merged[0]
  const minLines = Math.min(...attempts.map((a) => a.additions + a.deletions).filter((n) => n > 0))

  const rows: ReadonlyArray<{ readonly label: string; readonly cell: (a: typeof attempts[number]) => React.ReactNode }> = [
    { label: "State", cell: (a) => <StatusPill state={stateOf(a)} /> },
    { label: "Approach", cell: (a) => <span className="cmp-text">{a.intent}</span> },
    { label: "Commits", cell: (a) => full(a.commits.length) },
    {
      label: "Lines changed",
      cell: (a) => (
        <span className={a.additions + a.deletions === minLines ? "best" : undefined}>
          {full(a.additions + a.deletions)}
        </span>
      )
    },
    { label: "Files touched", cell: (a) => full(a.files.size) },
    {
      label: "Tests",
      cell: (a) =>
        a.tests === undefined
          ? <span className="quiet">Not run</span>
          : <span className={a.tests.failed > 0 ? "bad" : "ok"}>{a.tests.passed}/{a.tests.passed + a.tests.failed}</span>
    },
    { label: "Time taken", cell: (a) => clock(a.lastAt - a.assignedAt) },
    { label: "Conflicts", cell: (a) => full(a.conflicts.length) },
    {
      label: "Code",
      cell: (a) =>
        a.commits.length === 0
          ? <span className="quiet">No commits</span>
          : <button id={`cmp-code-${a.id}`} type="button" className="link-btn" onClick={() => onReview(a.id)}>View changes</button>
    }
  ]

  return (
    <section id="compare" className="panel" aria-labelledby="compare-title">
      <header className="panel-head">
        <h2 id="compare-title">
          <Scales aria-hidden="true" />
          Compare attempts
        </h2>
        {options.length > 1 && (
          <label className="select" htmlFor="compare-task">
            <span className="sr-only">Task</span>
            <select id="compare-task" value={task.taskId} onChange={(e) => onTask(e.currentTarget.value)}>
              {options.map((id) => {
                const t = store.tasks.get(id)!
                return (
                  <option key={id} value={id}>
                    {t.title} ({t.group}, {t.agents.length} attempts{t.decision ? ", decided" : ""})
                  </option>
                )
              })}
            </select>
          </label>
        )}
      </header>
      <p className="quiet small compare-reason">
        <span className="mode-tag mode-parallel">{modeLabel.parallel}</span> {task.reason}
      </p>
      <p className="quiet compare-sub">{task.title}</p>
      <div className="table-scroll">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Measure</span></th>
              {attempts.map((a) => (
                <th key={a.id} scope="col" className={a.id === winner ? "win" : undefined}>
                  <button id={`cmp-${a.id}`} type="button" className="link-btn" onClick={() => onOpen(a.id)}>
                    {agentName(a.id)}
                  </button>
                  {a.id === winner && (
                    <span className="win-tag">
                      <Trophy aria-hidden="true" />
                      Merged
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {attempts.map((a) => <td key={a.id} className={a.id === winner ? "win" : undefined}>{r.cell(a)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="reason">{task.decision?.reason ?? "The coordinator picks a winner once every attempt finishes its tests."}</p>
    </section>
  )
}
