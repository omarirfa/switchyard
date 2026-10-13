import { isHighRisk } from "../domain/Areas.ts"
import { analyze, type Change, type GroupMeta } from "../domain/Analyze.ts"
import type { FleetStore } from "../domain/Fleet.ts"
import { decodeReview, type MergeReview, type ReviewSubject } from "../domain/Review.ts"
import { SAMPLE_BRANCHES, SAMPLE_META } from "./sampleCode.ts"
import { synthesize } from "./synthCode.ts"

// SAMPLE DATA. Assembles a review for a merge or a branch from the sample code. A live
// Worker would run `diffcore analyze --base main --head <branch> -o review.json` and send
// that file with each changed file's contents; decodeReview accepts either source.

export type ReviewResult =
  | { readonly _tag: "ok"; readonly review: MergeReview; readonly title: string; readonly agents: ReadonlyArray<string> }
  | { readonly _tag: "empty"; readonly reason: string }

interface Branch {
  readonly changes: ReadonlyArray<Change>
  readonly meta: GroupMeta | undefined
  readonly notes: Readonly<Record<string, string>>
}

// Fleet branches carry one note per file; a group's summary lists its own files' notes.
const withNotes = (meta: GroupMeta | undefined, notes: Readonly<Record<string, string>>, files: ReadonlyArray<string>): GroupMeta | undefined => {
  if (meta === undefined || meta.summary.length > 0) return meta
  const lines = [...new Set(files.map((f) => notes[f]).filter((n): n is string => n !== undefined))]
  return { ...meta, summary: lines }
}

const branchOf = (store: FleetStore, agentId: string): Branch | undefined => {
  const rec = store.agents.get(agentId)
  if (rec === undefined) return undefined
  // The two scripted tasks that open the run have hand-written code.
  const sample = SAMPLE_BRANCHES[rec.taskId]?.[agentId]
  if (sample !== undefined) {
    // Show only files the agent has committed so far, so a rewind shows the branch as it was.
    const committed = new Set(rec.commits.flatMap((c) => c.files))
    return { changes: sample.filter((c) => committed.has(c.path)), meta: SAMPLE_META[rec.taskId]?.[agentId], notes: {} }
  }
  const title = store.tasks.get(rec.taskId)?.title ?? rec.task
  const s = synthesize(agentId, rec.group, title, [...rec.files].sort())
  return { changes: s.changes, meta: s.meta, notes: s.notes }
}

const cache = new Map<string, ReviewResult>()

export const reviewFor = (store: FleetStore, subject: ReviewSubject): ReviewResult => {
  const key = subject.kind === "merge"
    ? `${store.runId}|m|${subject.taskId}|${store.tasks.get(subject.taskId)?.decision?.targetSha ?? "open"}`
    : `${store.runId}|b|${subject.agentId}|${store.agents.get(subject.agentId)?.commits.length ?? 0}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const result = build(store, subject)
  if (cache.size > 200) cache.clear()
  cache.set(key, result)
  return result
}

const build = (store: FleetStore, subject: ReviewSubject): ReviewResult => {
  if (subject.kind === "branch") {
    const rec = store.agents.get(subject.agentId)
    const b = branchOf(store, subject.agentId)
    if (rec === undefined || b === undefined) return { _tag: "empty", reason: "This agent is not in the current run." }
    if (b.changes.length === 0) return { _tag: "empty", reason: "This branch has no commits yet." }
    const out = analyze({
      diffType: "BranchComparison",
      base: "main",
      head: rec.branch,
      headSha: rec.commits[rec.commits.length - 1]?.sha ?? null,
      changes: b.changes,
      highRisk: isHighRisk(rec.group),
      meta: (files) => withNotes(b.meta, b.notes, files)
    })
    const authors = Object.fromEntries(b.changes.map((c) => [c.path, [rec.id]]))
    return { _tag: "ok", review: decodeReview({ ...out, authors }), title: rec.task, agents: [rec.id] }
  }

  const task = store.tasks.get(subject.taskId)
  const d = task?.decision
  if (task === undefined) return { _tag: "empty", reason: "This task is not in the current run." }
  if (d === undefined) return { _tag: "empty", reason: "The coordinator has not decided this task yet." }
  if (d.merged.length === 0) return { _tag: "empty", reason: "The coordinator merged nothing from this task." }

  // A merge puts every merged branch on main. Later branches win a shared file, as
  // they were rebased onto the earlier ones before merging.
  const byPath = new Map<string, Change>()
  const authors = new Map<string, Array<string>>()
  const metas = new Map<string, GroupMeta>()
  const notes: Record<string, string> = {}
  for (const id of d.merged) {
    const b = branchOf(store, id)
    if (b === undefined) continue
    for (const c of b.changes) {
      const prev = byPath.get(c.path)
      byPath.set(c.path, prev === undefined ? c : { path: c.path, before: prev.before, after: c.after })
      authors.set(c.path, [...(authors.get(c.path) ?? []), id])
      if (b.meta !== undefined) metas.set(c.path, b.meta)
      const n = b.notes[c.path]
      if (n !== undefined) notes[c.path] = n
    }
  }
  const out = analyze({
    diffType: "CommitRange",
    base: `${d.targetSha}~1`,
    head: d.targetSha,
    headSha: d.targetSha,
    changes: [...byPath.values()],
    highRisk: isHighRisk(task.group),
    // Each flow group takes the metadata of the agent who wrote its first file.
    meta: (files) => withNotes(files.map((f) => metas.get(f)).find((m) => m !== undefined), notes, files)
  })
  return {
    _tag: "ok",
    review: decodeReview({ ...out, authors: Object.fromEntries(authors) }),
    title: task.title,
    agents: d.merged
  }
}
