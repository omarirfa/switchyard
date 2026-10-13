import { type Area, areaOf, isHighRisk } from "../domain/Areas.ts"
import type { CoordinationEvent } from "../domain/Events.ts"

// SAMPLE DATA. A deterministic simulated fleet for the scale preview. Every task,
// agent, file, and number below comes from a seeded random generator, so each replay
// is identical. The live Worker feed replaces this file; see FILLER_ITEMS.md.

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const GROUPS = [
  "auth", "billing", "search", "uploads", "notifications", "admin", "rate-limits", "webhooks",
  "audit-log", "i18n", "payments", "reports", "onboarding", "settings", "teams", "invites",
  "sso", "exports", "imports", "analytics", "feature-flags", "emails", "api-gateway", "cache",
  "queues", "scheduler", "media", "comments", "permissions", "sessions", "docs-site", "cli",
  "sdk-js", "sdk-python", "mobile-api", "status-page", "backups", "migrations", "observability", "pricing"
]

const FILE_NAMES = [
  "index", "routes", "handlers", "schema", "types", "service", "store", "client", "validate", "errors",
  "config", "utils", "worker", "queue", "cache", "metrics", "policy", "models", "views", "api", "jobs", "events"
]

const MODULES = ["core", "http", "jobs", "store", "ui", "sync", "rules", "io", "events", "limits", "auth", "report", "admin", "public", "internal", "legacy"]

const VERBS = ["Add retries to", "Paginate", "Validate input for", "Cache reads in", "Add metrics to", "Fix timeouts in", "Type the responses of", "Add tests for", "Log errors in", "Speed up"]

const APPROACHES = [
  "Change the fewest lines that fix the problem.",
  "Extract a shared helper and reuse it.",
  "Rewrite the handler around a typed schema.",
  "Write the failing tests first, then the fix.",
  "Put the change behind a feature flag."
]

const RESOLUTIONS = [
  "Rebased the later branch onto the earlier one and kept both changes.",
  "Kept the earlier change and reapplied the later edit on top.",
  "Merged both edits by hand and reran the affected tests."
]

// Agent setups (model, prompt, and tool versions). k-13 is a new version on probation.
const SETUPS = ["k-12", "m-7", "m-8", "k-13"] as const
const SETUP_FAIL: Record<string, number> = { "k-12": 0, "m-7": 0.06, "m-8": 0.01, "k-13": -0.03 }
const SETUP_REVERT: Record<string, number> = { "k-12": 0.006, "m-7": 0.025, "m-8": 0.008, "k-13": 0.004 }

const CONSTRAINTS = [
  "Adds no new dependencies.",
  "Touches only the files in scope.",
  "p95 latency stays within 5% of today.",
  "Keeps the public API unchanged.",
  "Writes no data outside its own tables."
]

interface QuestionTemplate {
  readonly question: string
  readonly options: ReadonlyArray<{ readonly label: string; readonly cost: string; readonly risk: "low" | "medium" | "high" }>
  readonly recommended: number
  readonly assumption: string
}

const QUESTIONS: Record<Area, ReadonlyArray<QuestionTemplate>> = {
  accounts: [{
    question: "Should a session survive a password change on other devices?",
    options: [
      { label: "Sign out every other device", cost: "Users sign in again", risk: "low" },
      { label: "Keep other devices signed in", cost: "Stolen sessions stay valid", risk: "high" }
    ],
    recommended: 0,
    assumption: "Sign out every other device."
  }],
  billing: [{
    question: "When a card fails at renewal, how long should the account stay active?",
    options: [
      { label: "7 day grace period", cost: "Up to 7 unpaid days", risk: "medium" },
      { label: "Suspend at once", cost: "More support tickets", risk: "low" },
      { label: "30 day grace period", cost: "Up to 30 unpaid days", risk: "high" }
    ],
    recommended: 0,
    assumption: "Keep the account active for 7 days."
  }],
  content: [{
    question: "Should uploads over the size limit be rejected or resized?",
    options: [
      { label: "Reject with a clear error", cost: "Users retry by hand", risk: "low" },
      { label: "Resize on the server", cost: "Extra compute per upload", risk: "medium" }
    ],
    recommended: 0,
    assumption: "Reject oversized uploads with an error."
  }],
  messaging: [{
    question: "Should failed webhook deliveries retry for 24 hours or 72 hours?",
    options: [
      { label: "24 hours", cost: "Some receivers miss events", risk: "medium" },
      { label: "72 hours", cost: "Larger retry queue", risk: "low" }
    ],
    recommended: 1,
    assumption: "Retry for 72 hours."
  }],
  platform: [{
    question: "Should rate-limited requests return 429 at once or wait in a queue?",
    options: [
      { label: "Return 429 at once", cost: "Clients handle retries", risk: "low" },
      { label: "Queue for up to 2 seconds", cost: "Higher latency under load", risk: "medium" }
    ],
    recommended: 0,
    assumption: "Return 429 at once."
  }],
  data: [{
    question: "Can this migration lock the table for up to 30 seconds?",
    options: [
      { label: "Run online in batches", cost: "Migration takes about 2 hours", risk: "low" },
      { label: "Lock for 30 seconds at night", cost: "Brief write outage", risk: "high" }
    ],
    recommended: 0,
    assumption: "Run the migration online in batches."
  }],
  developer: [{
    question: "Should the SDK keep the deprecated method for one more release?",
    options: [
      { label: "Keep it, warn on use", cost: "More code to maintain", risk: "low" },
      { label: "Remove it now", cost: "Breaks older integrations", risk: "high" }
    ],
    recommended: 0,
    assumption: "Keep the method and log a deprecation warning."
  }],
  ops: [{
    question: "Should the status page show partial outages per region?",
    options: [
      { label: "Show per region", cost: "More incidents to post", risk: "low" },
      { label: "Show one global status", cost: "Hides regional problems", risk: "medium" }
    ],
    recommended: 0,
    assumption: "Show status per region."
  }]
}

interface BehaviorTemplate {
  readonly title: string
  readonly request: string
  readonly before: string
  readonly after: string
  readonly contract: string
}

const BEHAVIORS: Record<Area, BehaviorTemplate> = {
  accounts: { title: "Sign-in with an expired password", request: "POST /login  password_age=400d", before: "200, signed in", after: "403 password_expired, reset email sent", contract: "Expired passwords force a reset before sign-in." },
  billing: { title: "Renewal with a declined card", request: "POST /renew  card=declined", before: "402, account suspended", after: "200, grace period until day 7", contract: "A failed renewal keeps the account active for 7 days." },
  content: { title: "Upload over the size limit", request: "POST /upload  size=120MB", before: "500 internal error", after: "413 file_too_large, limit 100MB", contract: "Oversized uploads return a clear error." },
  messaging: { title: "Webhook receiver down for 30 hours", request: "deliver event  receiver=down", before: "dropped after 24h", after: "delivered after 31h retry", contract: "Failed deliveries retry for 72 hours." },
  platform: { title: "61st request in one minute", request: "GET /api/items  61st/min", before: "200, served", after: "429 rate_limited, retry-after 12s", contract: "Requests over 60 per minute return 429." },
  data: { title: "Report on an empty date range", request: "GET /reports?from=2026-10-02&to=2026-10-01", before: "500 internal error", after: "400 invalid_range", contract: "Invalid ranges return a 400 with the reason." },
  developer: { title: "Call to a deprecated SDK method", request: "client.listAll()", before: "returns items", after: "returns items, logs deprecation warning", contract: "Deprecated methods keep working for one release." },
  ops: { title: "Outage in one region", request: "GET /status  eu-west down", before: "All systems normal", after: "Partial outage: eu-west", contract: "The status page shows outages per region." }
}

const REVERT_REASONS = [
  "p95 latency rose 18% after the merge.",
  "A downstream test suite started failing.",
  "The owner rolled back the change during the undo window."
]

const sha = (r: () => number) => Math.floor(r() * 0xfffffff).toString(16).padStart(7, "0")
const agentCode = (n: number) => n.toString(36).toUpperCase().padStart(4, "0")
const base = (f: string) => f.split("/").pop() ?? f

interface Plan {
  readonly id: string
  readonly taskId: string
  readonly group: string
  readonly unit: string
  readonly assignedAt: number
  readonly workAt: number
  readonly commitTimes: Array<number>
  readonly files: Array<Array<string>>
  testAt: number
  endAt: number
  readonly passes: boolean
  readonly testsTotal: number
  lines: number
  readonly setup: string
}

export interface SimOptions {
  readonly agents: number
  readonly seed: number
  // When the first simulated task starts, and how long the fleet takes to reach full size.
  readonly startAt: number
  readonly startWindowMs: number
}

const FAIL_RATE: Record<"single" | "parallel" | "split", number> = { single: 0.1, parallel: 0.12, split: 0.06 }

// Returns every event of the run, sorted by time.
export const simulateFleet = ({ agents: target, seed, startAt, startWindowMs }: SimOptions): ReadonlyArray<CoordinationEvent> => {
  const r = mulberry32(seed)
  const pick = <A,>(xs: ReadonlyArray<A>): A => xs[Math.floor(r() * xs.length)]!
  const between = (a: number, b: number) => a + r() * (b - a)
  const events: Array<CoordinationEvent> = []
  const plans: Array<Plan> = []
  const taskPlans = new Map<string, { mode: "single" | "parallel" | "split"; agents: Array<Plan> }>()


  let n = 0
  let t = 0
  // The fleet grows over the run: the agent count rises with the square of time, so
  // the first seconds show a handful of agents and the last ones reach the target.
  const rampAt = (count: number) => startAt + startWindowMs * Math.sqrt(count / target) + between(0, 400)

  type Mode = "single" | "parallel" | "split"
  const addTask = (group: string, title: string, mode: Mode, size: number, start: number, reason: string, mod: string): void => {
    const taskId = `t${(t++).toString(36)}`
    events.push({ _tag: "TaskCreated", at: start, taskId, group, title, mode, reason })
    const pool = FILE_NAMES.map((f) => `src/${group}/${mod}/${f}.ts`)
    const shared = pick(pool)
    const high = isHighRisk(group)
    events.push({
      _tag: "ContractSubmitted",
      at: start + 20,
      taskId,
      goal: title,
      constraints: [pick(CONSTRAINTS), pick(CONSTRAINTS)].filter((c, i, a) => a.indexOf(c) === i),
      files: [shared, pick(pool)].filter((f, i, a) => a.indexOf(f) === i),
      tests: [`${base(shared).replace(".ts", "")} handles the empty case`, `${group} p95 stays within budget`],
      risk: high ? "high" : "low"
    })
    events.push({
      _tag: "ContractApproved",
      at: start + (high ? between(150, 340) : 40),
      taskId,
      by: high ? "owner" : "coordinator",
      edited: high && r() < 0.2
    })
    const setupBase = Math.floor(r() * 3) + (start > startAt + startWindowMs / 2 && r() < 0.4 ? 1 : 0)
    const tp = { mode, agents: [] as Array<Plan> }
    for (let i = 0; i < size; i++) {
      const id = agentCode(n)
      const assignedAt = start + 60 + i * 40
      const workAt = assignedAt + between(300, 1500)
      const work = between(6_000, 24_000)
      const commitCount = 1 + Math.floor(r() * 4)
      const commitTimes = Array.from({ length: commitCount }, (_, k) => workAt + ((k + 1) / (commitCount + 0.5)) * work)
      const files = commitTimes.map(() => {
        const fs = new Set<string>([r() < 0.55 ? shared : pick(pool)])
        if (r() < 0.4) fs.add(pick(pool))
        return [...fs]
      })
      const testAt = workAt + work + between(200, 800)
      const plan: Plan = {
        id,
        taskId,
        group,
        unit: mode === "parallel" ? taskId : id,
        assignedAt,
        workAt,
        commitTimes,
        files,
        testAt,
        endAt: testAt + between(1_500, 5_000),
        passes: false,
        testsTotal: 8 + Math.floor(r() * 50),
        lines: 0,
        setup: SETUPS[(setupBase + i) % SETUPS.length]!
      }
      ;(plan as { passes: boolean }).passes = r() > FAIL_RATE[mode] + SETUP_FAIL[plan.setup]!
      plans.push(plan)
      tp.agents.push(plan)
      const first = base(files[0]![0]!)
      events.push({
        _tag: "AgentAssigned",
        at: assignedAt,
        agentId: id,
        taskId,
        group,
        branch: `${group}/${taskId}-${id.toLowerCase()}`,
        task: mode === "split" ? `Update ${first} for: ${title.toLowerCase()}` : title,
        intent: mode === "split" ? `Own the ${first} part of the task.` : pick(APPROACHES),
        setup: plan.setup
      })
      n++
    }
    taskPlans.set(taskId, tp)
    // A single attempt that fails comes back as a variant set of three, once its
    // conflicts and tests have had time to finish.
    const only = tp.agents[0]
    if (mode === "single" && only !== undefined && !only.passes && n + 3 <= target) {
      addTask(group, title, "parallel", 3, only.endAt + between(7_000, 8_500), `Retry: Agent ${only.id} failed its tests, so three setups compete on the second try.`, mod)
    }
  }

  while (n < target) {
    const group = GROUPS[Math.floor(Math.pow(r(), 1.6) * GROUPS.length)]!
    const title = `${pick(VERBS)} ${group.replace(/-/g, " ")}`
    const start = Math.floor(rampAt(n))
    const mod = pick(MODULES)
    // The coordinator spends agents by risk: competing attempts only where a wrong
    // merge costs the most, subtasks for large changes, one agent everywhere else.
    if (isHighRisk(group)) {
      addTask(group, title, "parallel", Math.min(target - n, 3 + Math.floor(r() * 3)), start, `${group} is a high-risk workstream, so several setups compete and a judge ranks them.`, mod)
    } else if (r() < 0.28) {
      const parts = Math.min(target - n, 2 + Math.floor(r() * 3))
      addTask(group, title, "split", parts, start, `The change spans ${parts} files that separate agents can own.`, mod)
    } else {
      addTask(group, title, "single", 1, start, "Low-risk change: one agent and one reviewer.", mod)
    }
  }

  // Conflicts: walk final commits in time order. When another merge unit is still
  // editing the same file, the later agent may conflict and block for a few seconds.
  const lastCommits = plans
    .map((p) => ({ p, at: p.commitTimes[p.commitTimes.length - 1]!, files: p.files[p.files.length - 1]! }))
    .sort((a, b) => a.at - b.at)
  const editing = new Map<string, { unit: string; id: string; until: number }>()
  let conflictN = 0
  for (const { p, at, files } of lastCommits) {
    for (const f of files) {
      const other = editing.get(f)
      if (other !== undefined && other.unit !== p.unit && other.until > at && r() < 0.3) {
        const blockedFor = between(2_000, 6_000)
        const cid = `c${(conflictN++).toString(36)}`
        events.push({
          _tag: "ConflictDetected",
          at: at + 150,
          conflictId: cid,
          agentIds: [other.id, p.id],
          file: f,
          detail: `Agent ${other.id} and Agent ${p.id} both changed ${base(f)}.`
        })
        events.push({ _tag: "AgentStatusChanged", at: at + 300, agentId: p.id, status: "blocked", note: `Waiting for the conflict in ${f}` })
        events.push({ _tag: "ConflictResolved", at: at + 300 + blockedFor, conflictId: cid, resolution: pick(RESOLUTIONS) })
        events.push({ _tag: "AgentStatusChanged", at: at + 350 + blockedFor, agentId: p.id, status: "working", note: `Rebasing onto Agent ${other.id}` })
        p.testAt += blockedFor + 400
        p.endAt += blockedFor + 400
        break
      }
      editing.set(f, { unit: p.unit, id: p.id, until: p.endAt })
    }
  }

  for (const p of plans) {
    events.push({ _tag: "AgentStatusChanged", at: p.workAt, agentId: p.id, status: "working", note: `Reading ${p.files[0]![0]}` })
    p.commitTimes.forEach((ct, k) => {
      const add = 4 + Math.floor(r() * 80)
      const del = Math.floor(r() * 25)
      p.lines += add + del
      events.push({
        _tag: "CommitPushed",
        at: ct,
        agentId: p.id,
        sha: sha(r),
        message: `Update ${p.files[k]!.map(base).join(", ")}`,
        files: p.files[k]!,
        additions: add,
        deletions: del
      })
    })
    events.push({ _tag: "AgentStatusChanged", at: p.testAt, agentId: p.id, status: "testing", note: `Running ${p.testsTotal} tests` })
    const failed = p.passes ? 0 : 1 + Math.floor(r() * 4)
    events.push({ _tag: "TestsFinished", at: p.endAt - 100, agentId: p.id, passed: p.testsTotal - failed, failed })
    events.push({
      _tag: "AgentStatusChanged",
      at: p.endAt,
      agentId: p.id,
      status: p.passes ? "done" : "failed",
      note: p.passes ? "All tests pass" : `${failed} of ${p.testsTotal} tests fail`
    })
  }

  for (const [taskId, tp] of taskPlans) {
    const at = Math.max(...tp.agents.map((a) => a.endAt)) + between(400, 1_500)
    const passing = tp.agents.filter((a) => a.passes)
    if (tp.mode === "parallel") {
      const best = [...passing].sort((a, b) => a.lines - b.lines)[0]
      events.push({
        _tag: "MergeDecided",
        at,
        taskId,
        merged: best === undefined ? [] : [best.id],
        rejected: tp.agents.filter((a) => a !== best).map((a) => a.id),
        targetSha: best === undefined ? "none" : sha(r),
        reason: best === undefined
          ? "No attempt passed its tests. The coordinator queues the task again."
          : `Agent ${best.id} passes every test with the smallest change (${best.lines} lines) of ${passing.length} passing attempts.`
      })
    } else if (tp.mode === "single") {
      const a = tp.agents[0]!
      events.push({
        _tag: "MergeDecided",
        at,
        taskId,
        merged: a.passes ? [a.id] : [],
        rejected: a.passes ? [] : [a.id],
        targetSha: a.passes ? sha(r) : "none",
        reason: a.passes
          ? `Agent ${a.id} passes all ${a.testsTotal} tests and its contract checks.`
          : `Agent ${a.id} fails its tests. The coordinator retries the task as a variant set.`
      })
    } else {
      const failing = tp.agents.filter((a) => !a.passes).map((a) => a.id)
      events.push({
        _tag: "MergeDecided",
        at,
        taskId,
        merged: passing.map((a) => a.id),
        rejected: failing,
        targetSha: sha(r),
        reason: failing.length === 0
          ? `All ${tp.agents.length} subtasks pass their tests.`
          : `${passing.length} of ${tp.agents.length} subtasks pass. The failing subtasks go back to the queue.`
      })
    }
  }

  // Decisions: about 2% of tasks ask their area owner a question mid-work. Agents in the
  // same workstream that ask the same question while it is open join the same card.
  // Owners answer urgent cards within seconds and the rest in review windows every 20 s.
  // Low-risk cards that wait past 18 s proceed on the default. Owner answers become
  // precedents that answer later matching questions at once.
  const WINDOW = 20_000
  const MAX_WAIT = 18_000
  const open = new Map<string, { id: string; answerAt: number }>()
  const precedents = new Set<string>()
  let decisionN = 0
  const byWork = [...plans].sort((a, b) => a.workAt - b.workAt)
  for (const p of byWork) {
    if (taskPlans.get(p.taskId)!.agents[0] !== p || r() > 0.022) continue
    const area = areaOf(p.group)
    const tpl = pick(QUESTIONS[area])
    const key = `${p.group}|${tpl.question}`
    const at = p.workAt + between(800, 3_000)
    const req = (id: string, urgent: boolean): CoordinationEvent => ({
      _tag: "DecisionRequested",
      at,
      decisionId: id,
      agentId: p.id,
      group: p.group,
      question: tpl.question,
      options: tpl.options,
      recommended: tpl.recommended,
      assumption: tpl.assumption,
      urgent
    })
    const live = open.get(key)
    if (live !== undefined && live.answerAt > at) {
      events.push(req(live.id, false))
      continue
    }
    const id = `d${(decisionN++).toString(36)}`
    if (precedents.has(key)) {
      events.push(req(id, false))
      events.push({ _tag: "DecisionAnswered", at: at + 120, decisionId: id, choice: tpl.recommended, by: "precedent", scope: `every ${p.group} task` })
      continue
    }
    const urgent = r() < 0.15
    const windowAt = Math.ceil(at / WINDOW) * WINDOW + between(300, 2_500)
    const lowRisk = !isHighRisk(p.group)
    const byDefault = !urgent && lowRisk && windowAt - at > MAX_WAIT
    const answerAt = urgent ? at + between(1_500, 4_000) : byDefault ? at + MAX_WAIT : windowAt
    const choice = byDefault || r() < 0.8 ? tpl.recommended : (tpl.recommended + 1) % tpl.options.length
    events.push(req(id, urgent))
    events.push({
      _tag: "DecisionAnswered",
      at: answerAt,
      decisionId: id,
      choice,
      by: byDefault ? "default" : "owner",
      scope: byDefault ? "this task only" : `every ${p.group} task`
    })
    open.set(key, { id, answerAt })
    if (!byDefault) precedents.add(key)
  }

  // Reverts and behavior diffs follow merges.
  const merges = events.filter((e): e is Extract<CoordinationEvent, { _tag: "MergeDecided" }> => e._tag === "MergeDecided")
  const planById = new Map(plans.map((p) => [p.id, p]))
  for (const m of merges) {
    for (const id of m.merged) {
      const p = planById.get(id)
      if (p === undefined) continue
      if (r() < SETUP_REVERT[p.setup]!) {
        events.push({ _tag: "MergeReverted", at: m.at + between(3_000, 12_000), taskId: m.taskId, agentId: id, reason: pick(REVERT_REASONS) })
      }
    }
    const first = m.merged[0]
    const p = first === undefined ? undefined : planById.get(first)
    if (p !== undefined && r() < 0.012) {
      const b = BEHAVIORS[areaOf(p.group)]
      events.push({ _tag: "BehaviorDiff", at: m.at + 200, taskId: m.taskId, agentId: p.id, ...b })
    }
  }

  return events.sort((a, b) => a.at - b.at)
}
