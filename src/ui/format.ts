import type { AgentStatus, CoordinationEvent, RunKind, TaskMode } from "../domain/Events.ts"
import type { AgentRec, Outcome, Phase } from "../domain/Fleet.ts"

// How the coordinator organised a task's agents.
export const modeLabel: Record<TaskMode, string> = {
  single: "Single attempt",
  parallel: "Variant set",
  split: "Split task"
}

export const statusLabel: Record<AgentStatus, string> = {
  queued: "Queued",
  working: "Working",
  testing: "Testing",
  blocked: "Blocked",
  done: "Done",
  failed: "Failed"
}

export const outcomeLabel: Record<Outcome, string> = {
  merged: "Merged",
  rejected: "Not merged"
}

// The single word a row or chip shows: the merge outcome once decided, else the status.
export const stateOf = (rec: AgentRec): AgentStatus | Outcome => rec.outcome ?? rec.status
export const stateLabel = (s: AgentStatus | Outcome): string =>
  s === "merged" || s === "rejected" ? outcomeLabel[s] : statusLabel[s]

export const phaseLabel: Record<Phase, string> = {
  waiting: "Waiting",
  running: "Running",
  complete: "Complete"
}

export const kindLabel: Record<RunKind, string> = {
  parallel: "Parallel attempts",
  split: "Split task",
  fleet: "Fleet"
}

const compactFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const fullFmt = new Intl.NumberFormat("en")

export const compact = (n: number): string => (Math.abs(n) < 10_000 ? fullFmt.format(n) : compactFmt.format(n))
export const full = (n: number): string => fullFmt.format(n)
export const pct = (part: number, whole: number): string =>
  whole === 0 ? "0%" : `${(Math.round((part / whole) * 1000) / 10).toString()}%`

export const clock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export const ago = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 1 ? "now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${full(n)} ${n === 1 ? one : many}`

export const agentName = (agentId: string): string => `Agent ${agentId}`

export const joinAgents = (agentIds: ReadonlyArray<string>, max = 3): string => {
  const names = agentIds.slice(0, max).map(agentName)
  const rest = agentIds.length - names.length
  if (rest > 0) return `${names.join(", ")} and ${rest} more`
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

export const runSummary = (kind: RunKind | undefined, agents: number, tasks: number, groups: number): string => {
  switch (kind) {
    case "parallel":
      return `${agents} agents attempt the same task on separate branches. The coordinator tests every attempt and merges one.`
    case "split":
      return `The coordinator splits the task into subtasks for ${agents} agents, resolves conflicts between their branches, and merges every branch.`
    case "fleet":
      return `${plural(agents, "agent")} ${agents === 1 ? "works" : "work"} on ${plural(tasks, "task")} across ${plural(groups, "workstream")}. The coordinator picks one agent, competing attempts, or subtasks for each task by its risk, tests every branch, and merges what passes.`
    case undefined:
      return "The coordinator assigns branches when a run starts."
  }
}

export const eventAgent = (event: CoordinationEvent): string | undefined =>
  "agentId" in event ? event.agentId : undefined

export const describe = (event: CoordinationEvent): string => {
  switch (event._tag) {
    case "RunStarted":
      return `Run started: ${event.title}`
    case "TaskCreated":
      return `Task created: ${event.title}`
    case "AgentAssigned":
      return `Assigned to ${event.branch}`
    case "AgentStatusChanged":
      return `${statusLabel[event.status]}: ${event.note}`
    case "CommitPushed":
      return `Pushed ${event.sha}: ${event.message}`
    case "TestsFinished":
      return `Tests finished with ${event.passed} passed and ${event.failed} failed`
    case "ConflictDetected":
      return `Conflict in ${event.file} between ${joinAgents(event.agentIds)}`
    case "ConflictResolved":
      return `Conflict resolved: ${event.resolution}`
    case "MergeDecided":
      return event.merged.length === 0
        ? `Merged nothing for task ${event.taskId}`
        : `Merged ${joinAgents(event.merged)} at ${event.targetSha}`
    case "ContractSubmitted":
      return `Contract submitted: ${event.goal}`
    case "ContractApproved":
      return `Contract approved by the ${event.by}${event.edited ? " with edits" : ""}`
    case "DecisionRequested":
      return `Asked: ${event.question}`
    case "DecisionAnswered":
      return event.by === "owner"
        ? `Owner answered a decision for ${event.scope}`
        : event.by === "precedent"
        ? "Answered by an earlier precedent"
        : "Proceeded on the default after the maximum wait"
    case "MergeReverted":
      return `Merge reverted: ${event.reason}`
    case "BehaviorDiff":
      return `Behavior changed: ${event.title}`
  }
}
