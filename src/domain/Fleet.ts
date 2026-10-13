import { type Area, AREAS, areaOf } from "./Areas.ts"
import type { AgentStatus, CoordinationEvent, Risk, RunKind, TaskMode } from "./Events.ts"

// FleetStore folds coordination events into indexes that stay cheap at any fleet size.
// Every ingest is O(1) apart from the files a commit touches. Views read counters and
// bounded top-K lists, never a full scan of every agent, except the agent table query.
//
// In production this store runs next to the data (one Durable Object per group or
// shard) and the dashboard receives views and paged queries over the network. In the
// preview it runs in the browser, which comfortably holds 10,000 agents.

export const STATUSES: ReadonlyArray<AgentStatus> = ["queued", "working", "testing", "blocked", "done", "failed"]
export type Counts = Record<AgentStatus, number>
const zero = (): Counts => ({ queued: 0, working: 0, testing: 0, blocked: 0, done: 0, failed: 0 })

export type Outcome = "merged" | "rejected"
export type Phase = "waiting" | "running" | "complete"

export interface Commit {
  readonly at: number
  readonly sha: string
  readonly message: string
  readonly files: ReadonlyArray<string>
  readonly additions: number
  readonly deletions: number
}

export interface AgentRec {
  readonly id: string
  readonly taskId: string
  readonly group: string
  readonly branch: string
  readonly task: string
  readonly intent: string
  readonly setup: string
  readonly assignedAt: number
  status: AgentStatus
  note: string
  lastAt: number
  commits: Array<Commit>
  additions: number
  deletions: number
  files: Set<string>
  tests: { passed: number; failed: number } | undefined
  outcome: Outcome | undefined
  events: Array<number>
  conflicts: Array<string>
}

export interface Decision {
  readonly taskId: string
  readonly merged: ReadonlyArray<string>
  readonly rejected: ReadonlyArray<string>
  readonly reason: string
  readonly targetSha: string
  readonly at: number
}

export interface TaskRec {
  readonly taskId: string
  readonly group: string
  readonly title: string
  readonly mode: TaskMode
  readonly reason: string
  readonly createdAt: number
  agents: Array<string>
  decision: Decision | undefined
}

export interface ConflictRec {
  readonly conflictId: string
  readonly agentIds: ReadonlyArray<string>
  readonly file: string
  readonly detail: string
  readonly from: number
  to: number | undefined
  resolution: string | undefined
}

export interface GroupRec {
  readonly name: string
  agents: number
  counts: Counts
  merged: number
  rejected: number
  commits: number
  openConflicts: number
  lastAt: number
}

export interface HistoryPoint {
  readonly at: number
  readonly counts: Counts
  readonly commits: number
  readonly merged: number
}

export interface StoreConfig {
  readonly bucketMs: number
  readonly stallMs: number
  readonly timelineBucketMs: number
}

export interface ContractRec {
  readonly taskId: string
  readonly group: string
  readonly goal: string
  readonly constraints: ReadonlyArray<string>
  readonly files: ReadonlyArray<string>
  readonly tests: ReadonlyArray<string>
  readonly risk: "low" | "high"
  readonly submittedAt: number
  approvedAt: number | undefined
  by: "coordinator" | "owner" | undefined
  edited: boolean
}

export interface DecisionCard {
  readonly decisionId: string
  readonly group: string
  readonly area: Area
  readonly question: string
  readonly options: ReadonlyArray<{ readonly label: string; readonly cost: string; readonly risk: Risk }>
  readonly recommended: number
  readonly assumption: string
  readonly urgent: boolean
  readonly askedAt: number
  agentIds: Array<string>
  answeredAt: number | undefined
  choice: number | undefined
  by: "owner" | "precedent" | "default" | undefined
  scope: string | undefined
}

export interface Precedent {
  readonly decisionId: string
  readonly area: Area
  readonly question: string
  readonly answer: string
  readonly scope: string
  readonly at: number
}

export interface SetupStats {
  readonly setup: string
  readonly area: Area
  finished: number
  passed: number
  merged: number
  rejected: number
  reverted: number
  overrides: number
}

export interface BehaviorRec {
  readonly at: number
  readonly taskId: string
  readonly agentId: string
  readonly area: Area
  readonly title: string
  readonly request: string
  readonly before: string
  readonly after: string
  readonly contract: string
}

export interface AreaStats {
  readonly area: Area
  merges: number
  commits: number
  readonly buckets: Array<number>
}

export interface OwnerLoad {
  readonly area: Area
  readonly delivered: number
  readonly answered: number
  readonly open: number
  readonly urgent: number
}

export interface HotFile {
  readonly file: string
  readonly agents: ReadonlyArray<string>
  readonly units: number
  readonly conflict: boolean
}

export type AttentionKind = "decisions" | "contracts" | "conflicts" | "failed" | "stalled" | "blocked" | "overlap" | "ready"
export interface AttentionItem {
  readonly kind: AttentionKind
  readonly count: number
  readonly sample: ReadonlyArray<string>
}

export type SortKey = "activity" | "commits" | "lines" | "failing" | "id"
export interface AgentQuery {
  readonly search: string
  readonly statuses: ReadonlySet<AgentStatus | Outcome>
  readonly group: string | undefined
  readonly ids: ReadonlySet<string> | undefined
  readonly sort: SortKey
}

export interface FleetView {
  readonly version: number
  readonly store: FleetStore
  readonly runId: string | undefined
  readonly kind: RunKind | undefined
  readonly title: string | undefined
  readonly phase: Phase
  readonly now: number
  readonly agents: number
  readonly counts: Counts
  readonly active: number
  readonly merged: number
  readonly rejected: number
  readonly commits: number
  readonly additions: number
  readonly deletions: number
  readonly testsPassed: number
  readonly testsTotal: number
  readonly openConflicts: number
  readonly conflictsTotal: number
  readonly tasks: number
  readonly decided: number
  readonly groups: ReadonlyArray<GroupRec>
  readonly history: ReadonlyArray<HistoryPoint>
  readonly attention: ReadonlyArray<AttentionItem>
  readonly hotFiles: ReadonlyArray<HotFile>
  readonly overlapFiles: number
  readonly overlapHigh: number
  readonly openConflictList: ReadonlyArray<ConflictRec>
  readonly resolvedConflictList: ReadonlyArray<ConflictRec>
  readonly decisions: ReadonlyArray<Decision>
  readonly tail: ReadonlyArray<CoordinationEvent>
  readonly eventCount: number
  readonly kindCounts: Readonly<Record<"status" | "commits" | "tests" | "conflicts", number>>
  readonly contractsPending: ReadonlyArray<ContractRec>
  readonly contractsPendingCount: number
  readonly contractsRecent: ReadonlyArray<ContractRec>
  readonly contractsByCoordinator: number
  readonly contractsByOwner: number
  readonly inboxOpen: ReadonlyArray<DecisionCard>
  readonly inboxOpenCount: number
  readonly inboxAnswered: ReadonlyArray<DecisionCard>
  readonly answeredBy: Readonly<Record<"owner" | "precedent" | "default", number>>
  readonly precedents: ReadonlyArray<Precedent>
  readonly owners: ReadonlyArray<OwnerLoad>
  readonly setups: ReadonlyArray<SetupStats>
  readonly reverts: number
  readonly behaviors: ReadonlyArray<BehaviorRec>
  readonly areas: ReadonlyArray<AreaStats>
  readonly timelineBucketMs: number
}

const TAIL = 200

export class FleetStore {
  readonly log: Array<CoordinationEvent> = []
  runId: string | undefined
  kind: RunKind | undefined
  title: string | undefined
  readonly agents = new Map<string, AgentRec>()
  readonly order: Array<string> = []
  readonly groups = new Map<string, GroupRec>()
  readonly tasks = new Map<string, TaskRec>()
  readonly taskOrder: Array<string> = []
  readonly conflicts = new Map<string, ConflictRec>()
  readonly decisions: Array<Decision> = []
  readonly counts = zero()
  readonly active = new Set<string>()
  readonly fileEditors = new Map<string, Set<string>>()
  readonly openConflictFiles = new Map<string, number>()
  readonly history: Array<HistoryPoint> = []
  readonly kindCounts = { status: 0, commits: 0, tests: 0, conflicts: 0 }
  readonly contracts = new Map<string, ContractRec>()
  readonly cards = new Map<string, DecisionCard>()
  readonly precedentList: Array<Precedent> = []
  readonly setupStats = new Map<string, SetupStats>()
  readonly behaviorList: Array<BehaviorRec> = []
  readonly areaStats = new Map<Area, AreaStats>(AREAS.map((a) => [a, { area: a, merges: 0, commits: 0, buckets: [] }]))
  readonly answeredBy = { owner: 0, precedent: 0, default: 0 }
  revertCount = 0
  merged = 0
  rejected = 0
  commits = 0
  additions = 0
  deletions = 0
  testsPassed = 0
  testsTotal = 0
  openConflicts = 0
  decided = 0
  lastAt = 0
  version = 0
  private nextBucket = 0

  constructor(readonly config: StoreConfig) {}

  static replay(log: ReadonlyArray<CoordinationEvent>, until: number, config: StoreConfig): FleetStore {
    const s = new FleetStore(config)
    for (const e of log) {
      if (e.at > until) break
      s.ingest(e)
    }
    s.lastAt = Math.max(s.lastAt, until)
    return s
  }

  ingestAll(events: ReadonlyArray<CoordinationEvent>) {
    for (const e of events) this.ingest(e)
  }

  private group(name: string): GroupRec {
    let g = this.groups.get(name)
    if (g === undefined) {
      g = { name, agents: 0, counts: zero(), merged: 0, rejected: 0, commits: 0, openConflicts: 0, lastAt: 0 }
      this.groups.set(name, g)
    }
    return g
  }

  // Agents that compete on one task form one merge unit: the coordinator merges only one of them,
  // so their overlapping files are not a risk. Split subtasks are separate units.
  unitOf(rec: AgentRec): string {
    return this.tasks.get(rec.taskId)?.mode === "parallel" ? rec.taskId : rec.id
  }

  private releaseFiles(rec: AgentRec) {
    for (const f of rec.files) {
      const set = this.fileEditors.get(f)
      if (set === undefined) continue
      set.delete(rec.id)
      if (set.size === 0) this.fileEditors.delete(f)
    }
  }

  private advanceHistory(at: number) {
    while (at >= this.nextBucket) {
      this.history.push({ at: this.nextBucket, counts: { ...this.counts }, commits: this.commits, merged: this.merged })
      this.nextBucket += this.config.bucketMs
    }
  }

  private setupOf(rec: AgentRec): SetupStats {
    const area = areaOf(rec.group)
    const key = `${rec.setup}|${area}`
    let st = this.setupStats.get(key)
    if (st === undefined) {
      st = { setup: rec.setup, area, finished: 0, passed: 0, merged: 0, rejected: 0, reverted: 0, overrides: 0 }
      this.setupStats.set(key, st)
    }
    return st
  }

  private bumpArea(group: string, at: number, merges: number) {
    const a = this.areaStats.get(areaOf(group))!
    a.merges += merges
    const i = Math.floor(at / this.config.timelineBucketMs)
    while (a.buckets.length <= i) a.buckets.push(0)
    a.buckets[i]! += merges
  }

  ingest(e: CoordinationEvent) {
    const idx = this.log.length
    this.log.push(e)
    this.advanceHistory(e.at)
    this.lastAt = Math.max(this.lastAt, e.at)
    this.version++

    switch (e._tag) {
      case "RunStarted":
        this.runId = e.runId
        this.kind = e.kind
        this.title = e.title
        return
      case "TaskCreated":
        this.tasks.set(e.taskId, {
          taskId: e.taskId,
          group: e.group,
          title: e.title,
          mode: e.mode,
          reason: e.reason,
          createdAt: e.at,
          agents: [],
          decision: undefined
        })
        this.taskOrder.push(e.taskId)
        this.group(e.group)
        return
      case "AgentAssigned": {
        const rec: AgentRec = {
          id: e.agentId,
          taskId: e.taskId,
          group: e.group,
          branch: e.branch,
          task: e.task,
          intent: e.intent,
          setup: e.setup,
          assignedAt: e.at,
          status: "queued",
          note: "",
          lastAt: e.at,
          commits: [],
          additions: 0,
          deletions: 0,
          files: new Set(),
          tests: undefined,
          outcome: undefined,
          events: [idx],
          conflicts: []
        }
        this.agents.set(e.agentId, rec)
        this.order.push(e.agentId)
        this.counts.queued++
        const g = this.group(e.group)
        g.agents++
        g.counts.queued++
        g.lastAt = e.at
        this.tasks.get(e.taskId)?.agents.push(e.agentId)
        return
      }
      case "AgentStatusChanged": {
        const rec = this.agents.get(e.agentId)
        if (rec === undefined) return
        const g = this.group(rec.group)
        this.counts[rec.status]--
        g.counts[rec.status]--
        rec.status = e.status
        this.counts[e.status]++
        g.counts[e.status]++
        rec.note = e.note
        rec.lastAt = e.at
        g.lastAt = e.at
        rec.events.push(idx)
        if (e.status === "working" || e.status === "testing") this.active.add(rec.id)
        else this.active.delete(rec.id)
        if (e.status === "failed") this.releaseFiles(rec)
        if (e.status === "done" || e.status === "failed") {
          const st = this.setupOf(rec)
          st.finished++
          if (e.status === "done") st.passed++
        }
        this.kindCounts.status++
        return
      }
      case "CommitPushed": {
        const rec = this.agents.get(e.agentId)
        if (rec === undefined) return
        rec.commits.push({ at: e.at, sha: e.sha, message: e.message, files: e.files, additions: e.additions, deletions: e.deletions })
        rec.additions += e.additions
        rec.deletions += e.deletions
        rec.lastAt = e.at
        rec.events.push(idx)
        this.commits++
        this.areaStats.get(areaOf(rec.group))!.commits++
        this.additions += e.additions
        this.deletions += e.deletions
        const g = this.group(rec.group)
        g.commits++
        g.lastAt = e.at
        for (const f of e.files) {
          rec.files.add(f)
          let set = this.fileEditors.get(f)
          if (set === undefined) {
            set = new Set()
            this.fileEditors.set(f, set)
          }
          set.add(rec.id)
        }
        this.kindCounts.commits++
        return
      }
      case "TestsFinished": {
        const rec = this.agents.get(e.agentId)
        if (rec === undefined) return
        if (rec.tests !== undefined) {
          this.testsPassed -= rec.tests.passed
          this.testsTotal -= rec.tests.passed + rec.tests.failed
        }
        rec.tests = { passed: e.passed, failed: e.failed }
        this.testsPassed += e.passed
        this.testsTotal += e.passed + e.failed
        rec.lastAt = e.at
        rec.events.push(idx)
        this.kindCounts.tests++
        return
      }
      case "ConflictDetected": {
        this.conflicts.set(e.conflictId, {
          conflictId: e.conflictId,
          agentIds: e.agentIds,
          file: e.file,
          detail: e.detail,
          from: e.at,
          to: undefined,
          resolution: undefined
        })
        this.openConflicts++
        this.openConflictFiles.set(e.file, (this.openConflictFiles.get(e.file) ?? 0) + 1)
        for (const id of e.agentIds) {
          const rec = this.agents.get(id)
          if (rec === undefined) continue
          rec.conflicts.push(e.conflictId)
          rec.events.push(idx)
        }
        const first = e.agentIds[0] === undefined ? undefined : this.agents.get(e.agentIds[0])
        if (first !== undefined) this.group(first.group).openConflicts++
        this.kindCounts.conflicts++
        return
      }
      case "ConflictResolved": {
        const c = this.conflicts.get(e.conflictId)
        if (c === undefined || c.to !== undefined) return
        c.to = e.at
        c.resolution = e.resolution
        this.openConflicts--
        const left = (this.openConflictFiles.get(c.file) ?? 1) - 1
        if (left <= 0) this.openConflictFiles.delete(c.file)
        else this.openConflictFiles.set(c.file, left)
        for (const id of c.agentIds) this.agents.get(id)?.events.push(idx)
        const first = c.agentIds[0] === undefined ? undefined : this.agents.get(c.agentIds[0])
        if (first !== undefined) this.group(first.group).openConflicts--
        this.kindCounts.conflicts++
        return
      }
      case "MergeDecided": {
        const d: Decision = {
          taskId: e.taskId,
          merged: e.merged,
          rejected: e.rejected,
          reason: e.reason,
          targetSha: e.targetSha,
          at: e.at
        }
        this.decisions.push(d)
        this.decided++
        const t = this.tasks.get(e.taskId)
        if (t !== undefined) t.decision = d
        for (const [ids, outcome] of [[e.merged, "merged"], [e.rejected, "rejected"]] as const) {
          for (const id of ids) {
            const rec = this.agents.get(id)
            if (rec === undefined) continue
            rec.outcome = outcome
            rec.events.push(idx)
            this.releaseFiles(rec)
            const g = this.group(rec.group)
            const st = this.setupOf(rec)
            if (outcome === "merged") {
              this.merged++
              g.merged++
              st.merged++
              this.bumpArea(rec.group, e.at, 1)
            } else {
              st.rejected++
              this.rejected++
              g.rejected++
            }
          }
        }
        this.kindCounts.commits++
        return
      }
      case "ContractSubmitted": {
        const t = this.tasks.get(e.taskId)
        this.contracts.set(e.taskId, {
          taskId: e.taskId,
          group: t?.group ?? "",
          goal: e.goal,
          constraints: e.constraints,
          files: e.files,
          tests: e.tests,
          risk: e.risk,
          submittedAt: e.at,
          approvedAt: undefined,
          by: undefined,
          edited: false
        })
        return
      }
      case "ContractApproved": {
        const c = this.contracts.get(e.taskId)
        if (c === undefined) return
        c.approvedAt = e.at
        c.by = e.by
        c.edited = e.edited
        return
      }
      case "DecisionRequested": {
        let card = this.cards.get(e.decisionId)
        if (card === undefined) {
          card = {
            decisionId: e.decisionId,
            group: e.group,
            area: areaOf(e.group),
            question: e.question,
            options: e.options,
            recommended: e.recommended,
            assumption: e.assumption,
            urgent: e.urgent,
            askedAt: e.at,
            agentIds: [],
            answeredAt: undefined,
            choice: undefined,
            by: undefined,
            scope: undefined
          }
          this.cards.set(e.decisionId, card)
        }
        if (!card.agentIds.includes(e.agentId)) card.agentIds.push(e.agentId)
        this.agents.get(e.agentId)?.events.push(idx)
        return
      }
      case "DecisionAnswered": {
        const card = this.cards.get(e.decisionId)
        if (card === undefined || card.answeredAt !== undefined) return
        card.answeredAt = e.at
        card.choice = e.choice
        card.by = e.by
        card.scope = e.scope
        this.answeredBy[e.by]++
        for (const id of card.agentIds) this.agents.get(id)?.events.push(idx)
        if (e.by === "owner") {
          this.precedentList.push({
            decisionId: card.decisionId,
            area: card.area,
            question: card.question,
            answer: card.options[e.choice]?.label ?? "",
            scope: e.scope,
            at: e.at
          })
          if (e.choice !== card.recommended) {
            for (const id of card.agentIds) {
              const rec = this.agents.get(id)
              if (rec !== undefined) this.setupOf(rec).overrides++
            }
          }
        }
        return
      }
      case "MergeReverted": {
        this.revertCount++
        const rec = this.agents.get(e.agentId)
        if (rec !== undefined) {
          this.setupOf(rec).reverted++
          rec.events.push(idx)
        }
        return
      }
      case "BehaviorDiff": {
        const rec = this.agents.get(e.agentId)
        this.behaviorList.push({
          at: e.at,
          taskId: e.taskId,
          agentId: e.agentId,
          area: areaOf(rec?.group ?? ""),
          title: e.title,
          request: e.request,
          before: e.before,
          after: e.after,
          contract: e.contract
        })
        rec?.events.push(idx)
        return
      }
    }
  }

  phase(): Phase {
    if (this.runId === undefined) return "waiting"
    return this.tasks.size > 0 && this.decided >= this.tasks.size ? "complete" : "running"
  }

  // Files that two or more merge units edit at once. `high` counts files with three or more.
  hotFiles(limit: number): { readonly list: ReadonlyArray<HotFile>; readonly total: number; readonly high: number } {
    const out: Array<HotFile> = []
    for (const [file, editors] of this.fileEditors) {
      if (editors.size < 2) continue
      const units = new Set<string>()
      for (const id of editors) {
        const rec = this.agents.get(id)
        if (rec !== undefined) units.add(this.unitOf(rec))
      }
      if (units.size < 2) continue
      out.push({ file, agents: [...editors], units: units.size, conflict: this.openConflictFiles.has(file) })
    }
    out.sort((a, b) => Number(b.conflict) - Number(a.conflict) || b.units - a.units || a.file.localeCompare(b.file))
    let high = 0
    for (const h of out) if (h.units >= 3) high++
    return { list: out.slice(0, limit), total: out.length, high }
  }

  attention(now: number, overlap: number): ReadonlyArray<AttentionItem> {
    const failed: Array<string> = []
    const blocked: Array<string> = []
    let failedOpen = 0
    for (let i = this.order.length - 1; i >= 0; i--) {
      const rec = this.agents.get(this.order[i]!)
      if (rec === undefined || rec.outcome !== undefined) continue
      if (rec.status === "failed") {
        failedOpen++
        if (failed.length < 3) failed.push(rec.id)
      }
      if (rec.status === "blocked" && blocked.length < 3) blocked.push(rec.id)
    }
    const stalled: Array<string> = []
    let stalledCount = 0
    for (const id of this.active) {
      const rec = this.agents.get(id)
      if (rec !== undefined && now - rec.lastAt > this.config.stallMs) {
        stalledCount++
        if (stalled.length < 3) stalled.push(id)
      }
    }
    let ready = 0
    const readySample: Array<string> = []
    for (const t of this.tasks.values()) {
      if (t.decision !== undefined || t.agents.length === 0) continue
      const finished = t.agents.every((id) => {
        const s = this.agents.get(id)?.status
        return s === "done" || s === "failed"
      })
      if (finished) {
        ready++
        if (readySample.length < 3) readySample.push(t.taskId)
      }
    }
    const conflictSample: Array<string> = []
    for (const c of this.conflicts.values()) {
      if (c.to === undefined && conflictSample.length < 3) conflictSample.push(c.conflictId)
    }
    let openCards = 0
    for (const c of this.cards.values()) if (c.answeredAt === undefined) openCards++
    let pendingContracts = 0
    for (const c of this.contracts.values()) if (c.approvedAt === undefined && c.risk === "high") pendingContracts++
    return [
      { kind: "decisions", count: openCards, sample: [] },
      { kind: "contracts", count: pendingContracts, sample: [] },
      { kind: "conflicts", count: this.openConflicts, sample: conflictSample },
      { kind: "failed", count: failedOpen, sample: failed },
      { kind: "stalled", count: stalledCount, sample: stalled },
      { kind: "blocked", count: this.counts.blocked, sample: blocked },
      { kind: "overlap", count: overlap, sample: [] },
      { kind: "ready", count: ready, sample: readySample }
    ]
  }

  query(q: AgentQuery): ReadonlyArray<string> {
    const needle = q.search.trim().toLowerCase()
    const out: Array<AgentRec> = []
    for (const id of this.order) {
      const rec = this.agents.get(id)!
      if (q.ids !== undefined && !q.ids.has(id)) continue
      if (q.group !== undefined && rec.group !== q.group) continue
      if (q.statuses.size > 0) {
        const outcomeHit = rec.outcome !== undefined && q.statuses.has(rec.outcome)
        const statusHit = rec.outcome === undefined && q.statuses.has(rec.status)
        if (!outcomeHit && !statusHit) continue
      }
      if (needle !== "") {
        const hay = `${rec.id} ${rec.group} ${rec.task} ${rec.branch}`.toLowerCase()
        if (!hay.includes(needle)) {
          let fileHit = false
          for (const f of rec.files) {
            if (f.toLowerCase().includes(needle)) {
              fileHit = true
              break
            }
          }
          if (!fileHit) continue
        }
      }
      out.push(rec)
    }
    const failRank = (r: AgentRec) => r.status === "failed" ? 0 : r.status === "blocked" ? 1 : r.conflicts.length > 0 ? 2 : 3
    switch (q.sort) {
      case "activity":
        out.sort((a, b) => b.lastAt - a.lastAt)
        break
      case "commits":
        out.sort((a, b) => b.commits.length - a.commits.length || b.lastAt - a.lastAt)
        break
      case "lines":
        out.sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
        break
      case "failing":
        out.sort((a, b) => failRank(a) - failRank(b) || b.lastAt - a.lastAt)
        break
      case "id":
        break
    }
    return out.map((r) => r.id)
  }

  view(): FleetView {
    const now = this.lastAt
    const hot = this.hotFiles(8)
    const busy = (g: GroupRec) => g.counts.working + g.counts.testing + g.counts.blocked
    const groups = [...this.groups.values()].sort((a, b) =>
      busy(b) - busy(a) || b.commits - a.commits || a.name.localeCompare(b.name)
    )
    const open: Array<ConflictRec> = []
    const resolved: Array<ConflictRec> = []
    for (const c of this.conflicts.values()) {
      if (c.to === undefined) open.push(c)
      else resolved.push(c)
    }
    return {
      version: this.version,
      store: this,
      runId: this.runId,
      kind: this.kind,
      title: this.title,
      phase: this.phase(),
      now,
      agents: this.agents.size,
      counts: { ...this.counts },
      active: this.active.size,
      merged: this.merged,
      rejected: this.rejected,
      commits: this.commits,
      additions: this.additions,
      deletions: this.deletions,
      testsPassed: this.testsPassed,
      testsTotal: this.testsTotal,
      openConflicts: this.openConflicts,
      conflictsTotal: this.conflicts.size,
      tasks: this.tasks.size,
      decided: this.decided,
      groups,
      history: this.history.slice(),
      attention: this.attention(now, hot.high),
      hotFiles: hot.list,
      overlapFiles: hot.total,
      overlapHigh: hot.high,
      openConflictList: open.slice(0, 6),
      resolvedConflictList: resolved.slice(-4).reverse(),
      decisions: this.decisions.slice(-6).reverse(),
      tail: this.log.slice(-TAIL),
      eventCount: this.log.length,
      kindCounts: { ...this.kindCounts },
      ...this.humanView()
    }
  }

  private humanView() {
    const pending: Array<ContractRec> = []
    const approved: Array<ContractRec> = []
    let byCoordinator = 0
    let byOwner = 0
    for (const c of this.contracts.values()) {
      if (c.approvedAt === undefined) {
        if (c.risk === "high") pending.push(c)
      } else {
        approved.push(c)
        if (c.by === "owner") byOwner++
        else byCoordinator++
      }
    }
    const open: Array<DecisionCard> = []
    const answered: Array<DecisionCard> = []
    const owners = new Map<Area, { delivered: number; answered: number; open: number; urgent: number }>()
    for (const a of AREAS) owners.set(a, { delivered: 0, answered: 0, open: 0, urgent: 0 })
    for (const c of this.cards.values()) {
      const o = owners.get(c.area)!
      if (c.answeredAt === undefined) {
        open.push(c)
        o.delivered++
        o.open++
        if (c.urgent) o.urgent++
      } else {
        answered.push(c)
        if (c.by === "owner") {
          o.delivered++
          o.answered++
        }
      }
    }
    const riskRank = (c: DecisionCard) => Math.max(...c.options.map((x) => (x.risk === "high" ? 2 : x.risk === "medium" ? 1 : 0)))
    open.sort((a, b) => Number(b.urgent) - Number(a.urgent) || riskRank(b) - riskRank(a) || b.agentIds.length - a.agentIds.length || a.askedAt - b.askedAt)
    answered.sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))
    pending.sort((a, b) => a.submittedAt - b.submittedAt)
    approved.sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
    return {
      contractsPending: pending.slice(0, 6),
      contractsPendingCount: pending.length,
      contractsRecent: approved.slice(0, 6),
      contractsByCoordinator: byCoordinator,
      contractsByOwner: byOwner,
      inboxOpen: open.slice(0, 8),
      inboxOpenCount: open.length,
      inboxAnswered: answered.slice(0, 6),
      answeredBy: { ...this.answeredBy },
      precedents: this.precedentList.slice(-8).reverse(),
      owners: AREAS.map((area): OwnerLoad => ({ area, ...owners.get(area)! })),
      setups: [...this.setupStats.values()],
      reverts: this.revertCount,
      behaviors: this.behaviorList.slice(-8).reverse(),
      areas: AREAS.map((a) => {
        const st = this.areaStats.get(a)!
        return { area: a, merges: st.merges, commits: st.commits, buckets: st.buckets.slice() }
      }),
      timelineBucketMs: this.config.timelineBucketMs
    }
  }
}
