import { Schema } from "effect"

// Coordination events the Worker will emit. The dashboard folds them into a FleetStore.
// Every event carries `at`: milliseconds since the run started.

// How a run organises work: one task with competing attempts, one task split into
// subtasks, or a fleet of many tasks of both kinds.
export const RunKind = Schema.Literals(["parallel", "split", "fleet"])
export type RunKind = typeof RunKind.Type

// How one task organises its agents: one agent, competing attempts (a variant set),
// or subtasks that separate agents own. The coordinator picks the mode by risk.
export const TaskMode = Schema.Literals(["single", "parallel", "split"])
export type TaskMode = typeof TaskMode.Type

export const AgentStatus = Schema.Literals(["queued", "working", "testing", "blocked", "done", "failed"])
export type AgentStatus = typeof AgentStatus.Type

export const RunStarted = Schema.TaggedStruct("RunStarted", {
  at: Schema.Number,
  runId: Schema.String,
  kind: RunKind,
  title: Schema.String
})

export const TaskCreated = Schema.TaggedStruct("TaskCreated", {
  at: Schema.Number,
  taskId: Schema.String,
  group: Schema.String,
  title: Schema.String,
  mode: TaskMode,
  // Why the coordinator chose this mode, in one sentence.
  reason: Schema.String
})

export const AgentAssigned = Schema.TaggedStruct("AgentAssigned", {
  at: Schema.Number,
  agentId: Schema.String,
  taskId: Schema.String,
  group: Schema.String,
  branch: Schema.String,
  task: Schema.String,
  intent: Schema.String,
  setup: Schema.String
})

export const AgentStatusChanged = Schema.TaggedStruct("AgentStatusChanged", {
  at: Schema.Number,
  agentId: Schema.String,
  status: AgentStatus,
  note: Schema.String
})

export const CommitPushed = Schema.TaggedStruct("CommitPushed", {
  at: Schema.Number,
  agentId: Schema.String,
  sha: Schema.String,
  message: Schema.String,
  files: Schema.Array(Schema.String),
  additions: Schema.Number,
  deletions: Schema.Number
})

export const TestsFinished = Schema.TaggedStruct("TestsFinished", {
  at: Schema.Number,
  agentId: Schema.String,
  passed: Schema.Number,
  failed: Schema.Number
})

export const ConflictDetected = Schema.TaggedStruct("ConflictDetected", {
  at: Schema.Number,
  conflictId: Schema.String,
  agentIds: Schema.Array(Schema.String),
  file: Schema.String,
  detail: Schema.String
})

export const ConflictResolved = Schema.TaggedStruct("ConflictResolved", {
  at: Schema.Number,
  conflictId: Schema.String,
  resolution: Schema.String
})

export const MergeDecided = Schema.TaggedStruct("MergeDecided", {
  at: Schema.Number,
  taskId: Schema.String,
  merged: Schema.Array(Schema.String),
  rejected: Schema.Array(Schema.String),
  reason: Schema.String,
  targetSha: Schema.String
})

export const Risk = Schema.Literals(["low", "medium", "high"])
export type Risk = typeof Risk.Type

// Intent contract: the goal, limits, scope, and acceptance tests agreed before any code.
export const ContractSubmitted = Schema.TaggedStruct("ContractSubmitted", {
  at: Schema.Number,
  taskId: Schema.String,
  goal: Schema.String,
  constraints: Schema.Array(Schema.String),
  files: Schema.Array(Schema.String),
  tests: Schema.Array(Schema.String),
  risk: Schema.Literals(["low", "high"])
})

export const ContractApproved = Schema.TaggedStruct("ContractApproved", {
  at: Schema.Number,
  taskId: Schema.String,
  by: Schema.Literals(["coordinator", "owner"]),
  edited: Schema.Boolean
})

export const DecisionOption = Schema.Struct({
  label: Schema.String,
  cost: Schema.String,
  risk: Risk
})

// A question an agent sends to the owner of its product area. Several agents asking the
// same question share one decisionId, so the owner sees one card.
export const DecisionRequested = Schema.TaggedStruct("DecisionRequested", {
  at: Schema.Number,
  decisionId: Schema.String,
  agentId: Schema.String,
  group: Schema.String,
  question: Schema.String,
  options: Schema.Array(DecisionOption),
  recommended: Schema.Number,
  assumption: Schema.String,
  urgent: Schema.Boolean
})

export const DecisionAnswered = Schema.TaggedStruct("DecisionAnswered", {
  at: Schema.Number,
  decisionId: Schema.String,
  choice: Schema.Number,
  by: Schema.Literals(["owner", "precedent", "default"]),
  scope: Schema.String
})

export const MergeReverted = Schema.TaggedStruct("MergeReverted", {
  at: Schema.Number,
  taskId: Schema.String,
  agentId: Schema.String,
  reason: Schema.String
})

// The same request sent to the old and new commit, side by side.
export const BehaviorDiff = Schema.TaggedStruct("BehaviorDiff", {
  at: Schema.Number,
  taskId: Schema.String,
  agentId: Schema.String,
  title: Schema.String,
  request: Schema.String,
  before: Schema.String,
  after: Schema.String,
  contract: Schema.String
})

export const CoordinationEvent = Schema.Union([
  RunStarted,
  TaskCreated,
  AgentAssigned,
  AgentStatusChanged,
  CommitPushed,
  TestsFinished,
  ConflictDetected,
  ConflictResolved,
  MergeDecided,
  ContractSubmitted,
  ContractApproved,
  DecisionRequested,
  DecisionAnswered,
  MergeReverted,
  BehaviorDiff
])
export type CoordinationEvent = typeof CoordinationEvent.Type
