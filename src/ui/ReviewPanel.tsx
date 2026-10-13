import { ArrowLeft, ArrowRight, Check, Circle, GitBranch, GitMerge, Keyboard, Target } from "@phosphor-icons/react"
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react"
import { reviewFor } from "../data/reviews.ts"
import type { FleetView } from "../domain/Fleet.ts"
import { type DiffLine, fileDiff, sideBySide } from "../domain/LineDiff.ts"
import type { FileChange, FlowGroup, ImpactScope, ReviewComplexity, ReviewFocus, ReviewSubject, Risk } from "../domain/Review.ts"
import { agentName, clock, full, plural } from "./format.ts"
import { SidePanel } from "./SidePanel.tsx"

// Code review for one merge or one branch, laid out the way Diffcore's desktop app
// reads a change: flow groups in review order on the left, the group's review notes
// and flow graph above, then one file's diff at a time.

const TYPE_LABEL: Record<string, string> = {
  Feat: "Feature", Fix: "Fix", Perf: "Performance", Refactor: "Refactor", Test: "Tests", Docs: "Docs", Build: "Build", Ci: "CI", Chore: "Chore"
}
const IMPACT_LABEL: Record<ImpactScope, string> = { Local: "Local impact", Module: "Module impact", CrossCutting: "Cross-cutting impact", System: "System impact" }
const COMPLEXITY_LABEL: Record<ReviewComplexity, string> = { Trivial: "Trivial review", Simple: "Simple review", Moderate: "Moderate review", Complex: "Complex review" }
const FOCUS_LABEL: Record<ReviewFocus, string> = {
  Correctness: "Correctness", Security: "Security", Concurrency: "Concurrency", Performance: "Performance",
  DataIntegrity: "Data integrity", Compatibility: "Compatibility", ErrorHandling: "Error handling", ApiContract: "API contract"
}
const riskClass = (r: Risk | null) => (r === "Critical" || r === "High" ? "risk-high" : r === "Medium" ? "risk-medium" : "risk-low")
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1)
const fileId = (p: string) => `rv-file-${p.replace(/[^a-z0-9]/gi, "-")}`

// Keywords, strings, comments, and numbers. Enough colour to read a diff quickly.
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|const|let|async|await|return|if|else|for|of|function|type|interface|class|extends|new|throw|try|catch|as|default|readonly|override|true|false|undefined|null)\b|\b(\d[\d_]*(?:\.\d+)?)\b/g
const highlight = (text: string, language: string): ReactNode => {
  if (language === "plaintext") return text
  const out: Array<ReactNode> = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    const cls = m[1] !== undefined ? "tk-c" : m[2] !== undefined ? "tk-s" : m[3] !== undefined ? (language === "json" ? undefined : "tk-k") : "tk-n"
    out.push(cls === undefined ? m[0] : <span key={i} className={cls}>{m[0]}</span>)
    last = i + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const FlowGraph = ({ group, selected, onSelect }: {
  readonly group: FlowGroup
  readonly selected: string
  readonly onSelect: (path: string) => void
}) => {
  const files = group.files.slice().sort((a, b) => a.flow_position - b.flow_position)
  const NW = 132
  const GAP = 36
  const W = Math.max(360, files.length * NW + (files.length - 1) * GAP + 16)
  const H = 84
  const x = (i: number) => 8 + i * (NW + GAP)
  const idx = new Map(files.map((f, i) => [f.path, i]))
  return (
    <svg className="fg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Flow through ${plural(files.length, "file")}: ${files.map((f) => baseName(f.path)).join(", ")}`}>
      <defs>
        <marker id="fg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L7 4L1 7" className="fg-arrowhead" />
        </marker>
      </defs>
      {group.edges.map((e) => {
        const a = idx.get(e.from)
        const b = idx.get(e.to)
        if (a === undefined || b === undefined) return null
        const forward = b > a
        const x1 = forward ? x(a) + NW : x(a)
        const x2 = forward ? x(b) : x(b) + NW
        const y = 34
        const lift = Math.abs(b - a) > 1 ? 26 : 0
        return (
          <path
            key={`${e.from}-${e.to}`}
            className={`fg-edge fg-${e.edge_type.toLowerCase()}`}
            d={`M${x1} ${y}C${(x1 + x2) / 2} ${y - lift} ${(x1 + x2) / 2} ${y - lift} ${x2} ${y}`}
            markerEnd="url(#fg-arrow)"
          />
        )
      })}
      {files.map((f, i) => (
        <g key={f.path} className={f.path === selected ? "fg-node on" : "fg-node"} transform={`translate(${x(i)} 14)`} onClick={() => onSelect(f.path)}>
          <rect width={NW} height={40} rx={7} />
          <text x={NW / 2} y={18} textAnchor="middle" className="fg-name">{baseName(f.path)}</text>
          <text x={NW / 2} y={32} textAnchor="middle" className="fg-role">{f.role}</text>
          <text x={NW / 2} y={58} textAnchor="middle" className="fg-step">{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

const Unified = ({ lines, language }: { readonly lines: ReadonlyArray<DiffLine>; readonly language: string }) => (
  <>
    {lines.map((l, k) => (
      <tr key={k} className={`dl dl-${l.kind}`}>
        <td className="ln">{l.a ?? ""}</td>
        <td className="ln">{l.b ?? ""}</td>
        <td className="code">
          <span className="sign" aria-hidden="true">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
          {l.kind !== "eq" && <span className="sr-only">{l.kind === "add" ? "Added: " : "Removed: "}</span>}
          {highlight(l.text, language)}
        </td>
      </tr>
    ))}
  </>
)

const Split = ({ lines, language }: { readonly lines: ReadonlyArray<DiffLine>; readonly language: string }) => (
  <>
    {sideBySide(lines).map((r, k) => (
      <tr key={k} className="dl">
        <td className="ln">{r.left?.a ?? ""}</td>
        <td className={`code half ${r.left === undefined ? "dl-gap" : r.left.kind === "del" ? "dl-del" : ""}`}>
          {r.left !== undefined && highlight(r.left.text, language)}
        </td>
        <td className="ln">{r.right?.b ?? ""}</td>
        <td className={`code half ${r.right === undefined ? "dl-gap" : r.right.kind === "add" ? "dl-add" : ""}`}>
          {r.right !== undefined && highlight(r.right.text, language)}
        </td>
      </tr>
    ))}
  </>
)

interface NavItem {
  readonly path: string
  readonly group: FlowGroup | undefined
  readonly change: FileChange | undefined
}

const FileButton = ({ path, role, on, done, change, onPick }: {
  readonly path: string
  readonly role: string
  readonly on: boolean
  readonly done: boolean
  readonly change: FileChange | undefined
  readonly onPick: (p: string) => void
}) => (
  <button id={fileId(path)} type="button" className={on ? "rv-file on" : "rv-file"} aria-current={on ? "true" : undefined} onClick={() => onPick(path)}>
    {done ? <Check aria-label="Reviewed" className="rv-done" /> : <Circle aria-hidden="true" className="rv-todo" />}
    <span className="rv-file-name" title={path}>{baseName(path)}</span>
    <span className="rv-role">{role}</span>
    {change !== undefined && <span className="add">+{change.changes.additions}</span>}
    {change !== undefined && <span className="del">&minus;{change.changes.deletions}</span>}
  </button>
)

export const ReviewPanel = ({ view, subject, onClose, onOpenAgent }: {
  readonly view: FleetView
  readonly subject: ReviewSubject
  readonly onClose: () => void
  readonly onOpenAgent: (id: string) => void
}) => {
  const store = view.store
  const result = useMemo(() => reviewFor(store, subject), [store, subject, view.version])
  const review = result._tag === "ok" ? result.review : undefined
  const analysis = review?.analysis
  const groups = useMemo(() => (analysis?.groups ?? []).slice().sort((a, b) => a.review_order - b.review_order), [analysis])

  const nav: ReadonlyArray<NavItem> = useMemo(() => {
    const items: Array<NavItem> = groups.flatMap((g) => g.files.slice().sort((a, b) => a.flow_position - b.flow_position).map((f) => ({ path: f.path, group: g, change: f })))
    for (const p of analysis?.infrastructure_group?.files ?? []) items.push({ path: p, group: undefined, change: undefined })
    return items
  }, [groups, analysis])

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [mode, setMode] = useState<"unified" | "split">("unified")
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set())
  const current = nav.find((n) => n.path === selected) ?? nav[0]
  const at = current === undefined ? -1 : nav.indexOf(current)
  const content = review?.files.find((f) => f.path === current?.path)
  const diff = useMemo(() => (content === undefined ? undefined : fileDiff(content.old_content, content.new_content)), [content])
  const totals = useMemo(() => {
    let a = 0
    let d = 0
    for (const f of review?.files ?? []) {
      const x = fileDiff(f.old_content, f.new_content)
      a += x.additions
      d += x.deletions
    }
    return { a, d }
  }, [review])

  const toggle = (path: string) => setReviewed((s) => {
    const n = new Set(s)
    if (n.has(path)) n.delete(path)
    else n.add(path)
    return n
  })
  const go = (step: number) => {
    const next = nav[Math.min(nav.length - 1, Math.max(0, at + step))]
    if (next !== undefined) setSelected(next.path)
  }
  const goGroup = (step: number) => {
    const order = [...new Set(nav.map((n) => n.group))]
    const gi = order.indexOf(current?.group)
    const target = order[Math.min(order.length - 1, Math.max(0, gi + step))]
    const first = nav.find((n) => n.group === target)
    if (first !== undefined) setSelected(first.path)
  }

  // j and k move between files, J and K between groups, x marks a file reviewed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, select, textarea") != null) return
      if (e.key === "j") go(1)
      else if (e.key === "k") go(-1)
      else if (e.key === "J") goGroup(1)
      else if (e.key === "K") goGroup(-1)
      else if (e.key === "x" && current !== undefined) toggle(current.path)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  useEffect(() => {
    document.getElementById("rv-diff")?.scrollTo({ top: 0 })
    if (current !== undefined) document.getElementById(fileId(current.path))?.scrollIntoView({ block: "nearest" })
  }, [current?.path])

  const decision = subject.kind === "merge" ? store.tasks.get(subject.taskId)?.decision : undefined
  const rec = subject.kind === "branch" ? store.agents.get(subject.agentId) : undefined
  const title = result._tag === "ok" ? result.title : subject.kind === "merge" ? store.tasks.get(subject.taskId)?.title ?? "Merge" : rec?.task ?? "Branch"
  const subtitle = subject.kind === "merge"
    ? decision === undefined ? "Waiting for a merge decision" : `Merged into main as ${decision.targetSha} at ${clock(decision.at)}`
    : rec === undefined ? "" : `${rec.branch} compared with main${rec.outcome === "rejected" ? ", not merged" : rec.outcome === "merged" ? ", merged" : ""}`
  const group = current?.group
  const authors = current === undefined ? [] : review?.authors[current.path] ?? []

  return (
    <SidePanel
      labelId="rv-title"
      size="wide"
      title={<span className="rv-title">{subject.kind === "merge" ? <GitMerge aria-hidden="true" /> : <GitBranch aria-hidden="true" />}{title}</span>}
      subtitle={subtitle}
      badge={<span className="chip">Sample code</span>}
      onClose={onClose}
    >
      {result._tag === "empty" || analysis === undefined || review === undefined
        ? <p className="quiet">{result._tag === "empty" ? result.reason : "No changes to show."}</p>
        : (
          <div className="rv">
            <div className="rv-bar">
              <span className="rv-stat"><b>{plural(review.files.length, "file")}</b> in {plural(groups.length, "flow group")}</span>
              <span className="add">+{full(totals.a)}</span>
              <span className="del">&minus;{full(totals.d)}</span>
              <span className="quiet rv-note">net change against main</span>
              <span className="rv-authors">
                {result.agents.map((id) => (
                  <button key={id} id={`rv-agent-${id}`} type="button" className="mini-agent" onClick={() => onOpenAgent(id)} title={`Open ${agentName(id)}`}>
                    <span className="pill-dot" aria-hidden="true" />
                    {id}
                  </button>
                ))}
              </span>
              <span className="rv-spacer" />
              <span className="quiet rv-progress">{reviewed.size} of {nav.length} reviewed</span>
              <div className="segmented segmented-small rv-mode" role="radiogroup" aria-label="Diff layout">
                {(["unified", "split"] as const).map((m) => (
                  <button key={m} id={`rv-mode-${m}`} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "seg on" : "seg"} onClick={() => setMode(m)}>
                    {m === "unified" ? "Unified" : "Split"}
                  </button>
                ))}
              </div>
            </div>

            <div className="rv-grid">
              <nav className="rv-nav" aria-label="Files in review order">
                <label className="rv-pick select">
                  <span className="sr-only">File</span>
                  <select id="rv-file-select" value={current?.path ?? ""} onChange={(e) => setSelected(e.target.value)}>
                    {nav.map((n, i) => <option key={n.path} value={n.path}>{i + 1}. {n.path}</option>)}
                  </select>
                </label>
                <ol className="rv-groups">
                  {groups.map((g) => (
                    <li key={g.id} className={g === group ? "rv-group on" : "rv-group"}>
                      <div className="rv-group-head">
                        <span className="rv-order">{g.review_order}</span>
                        <span className="rv-group-name">{g.name}</span>
                      </div>
                      <div className="rv-chips">
                        {g.group_type !== null && <span className="chip">{TYPE_LABEL[g.group_type]}</span>}
                        <span className={`risk-tag ${riskClass(g.risk)}`}>{g.risk ?? "Low"} risk</span>
                      </div>
                      <ul className="rv-files">
                        {g.files.slice().sort((a, b) => a.flow_position - b.flow_position).map((f) => (
                          <li key={f.path}>
                            <FileButton path={f.path} role={f.role} on={f.path === current?.path} done={reviewed.has(f.path)} change={f} onPick={setSelected} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                  {analysis.infrastructure_group !== null && (
                    <li className={current !== undefined && current.group === undefined ? "rv-group on" : "rv-group"}>
                      <div className="rv-group-head">
                        <span className="rv-order rv-order-infra" aria-hidden="true" />
                        <span className="rv-group-name">Configuration</span>
                      </div>
                      <p className="quiet small">{analysis.infrastructure_group.reason}</p>
                      <ul className="rv-files">
                        {analysis.infrastructure_group.files.map((p) => (
                          <li key={p}>
                            <FileButton path={p} role="Config" on={p === current?.path} done={reviewed.has(p)} change={undefined} onPick={setSelected} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ol>
                <p className="quiet small rv-keys">
                  <Keyboard aria-hidden="true" />
                  <span>j and k move between files, J and K between groups, x marks a file reviewed.</span>
                </p>
              </nav>

              <div className="rv-main">
                {group !== undefined && (
                  <section className="rv-glance" aria-label="Review notes for this group">
                    <div className="rv-chips">
                      {group.group_type !== null && <span className="chip">{TYPE_LABEL[group.group_type]}</span>}
                      <span className={`risk-tag ${riskClass(group.risk)}`}>{group.risk ?? "Low"} risk</span>
                      {group.impact !== null && <span className="chip">{IMPACT_LABEL[group.impact]}</span>}
                      {group.complexity !== null && <span className="chip">{COMPLEXITY_LABEL[group.complexity]}</span>}
                      {group.review_focus.length > 0 && <span className="quiet small">Focus: {group.review_focus.map((f) => FOCUS_LABEL[f]).join(", ")}</span>}
                    </div>
                    {group.description !== null && <p className="rv-desc">{group.description}</p>}
                    {group.invariant !== null && (
                      <p className="rv-inv">
                        <Target aria-hidden="true" />
                        <span><b>Check while reading:</b> {group.invariant}</span>
                      </p>
                    )}
                    {/* Diffcore's spec: one summary entry reads as prose, several as a list. */}
                    {group.summary.length === 1 && <p className="small">{group.summary[0]}</p>}
                    {group.summary.length > 1 && (
                      <ul className="rv-summary">
                        {group.summary.map((s) => <li key={s}>{s}</li>)}
                      </ul>
                    )}
                    {group.files.length > 1 && <FlowGraph group={group} selected={current?.path ?? ""} onSelect={setSelected} />}
                  </section>
                )}

                {current !== undefined && content !== undefined && diff !== undefined && (
                  <section className="rv-file-view" aria-label={`Changes in ${current.path}`}>
                    <header className="rv-file-head">
                      <code className="rv-path">{current.path}</code>
                      {content.old_content === "" && <span className="chip">New file</span>}
                      <span className="add">+{diff.additions}</span>
                      <span className="del">&minus;{diff.deletions}</span>
                      {current.change !== undefined && current.change.symbols_changed.length > 0 && (
                        <span className="quiet small rv-symbols">Changes {current.change.symbols_changed.join(", ")}</span>
                      )}
                      <span className="rv-spacer" />
                      {authors.map((id) => (
                        <button key={id} id={`rv-by-${id}`} type="button" className="link-btn small" onClick={() => onOpenAgent(id)}>{agentName(id)}</button>
                      ))}
                      <button id="rv-mark" type="button" className={reviewed.has(current.path) ? "btn btn-small rv-marked" : "btn btn-small"} aria-pressed={reviewed.has(current.path)} onClick={() => toggle(current.path)}>
                        <Check aria-hidden="true" />
                        {reviewed.has(current.path) ? "Reviewed" : "Mark reviewed"}
                      </button>
                    </header>
                    <div id="rv-diff" className="rv-diff" tabIndex={0} aria-label={`Diff of ${current.path}`}>
                      <table className={mode === "split" ? "dt dt-split" : "dt"}>
                        <tbody>
                          {diff.hunks.map((h, i) => (
                            <Fragment key={i}>
                              <tr className="dh">
                                <td colSpan={mode === "split" ? 4 : 3}>@@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@</td>
                              </tr>
                              {mode === "split" ? <Split lines={h.lines} language={content.language} /> : <Unified lines={h.lines} language={content.language} />}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <footer className="rv-foot">
                      <button id="rv-prev" type="button" className="btn btn-small" onClick={() => go(-1)} disabled={at <= 0}>
                        <ArrowLeft aria-hidden="true" />
                        Previous file
                      </button>
                      <span className="quiet small">File {at + 1} of {nav.length}</span>
                      <button id="rv-next" type="button" className="btn btn-small" onClick={() => go(1)} disabled={at >= nav.length - 1}>
                        Next file
                        <ArrowRight aria-hidden="true" />
                      </button>
                    </footer>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
    </SidePanel>
  )
}
