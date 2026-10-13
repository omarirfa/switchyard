import { Schema } from "effect"

// Review data for one merge or one branch, in the JSON shape that Diffcore
// (github.com/jamesaphoenix/diff-core, MIT) writes with `diffcore analyze -o review.json`,
// plus the per-file old and new contents that its desktop app reads with `get_file_diff`.
// Field names and enum spellings follow crates/diffcore-core/src/types.rs so a live
// Worker can hand the dashboard Diffcore's output unchanged.

export const EdgeType = Schema.Literals(["Imports", "Calls", "Extends", "Instantiates", "Reads", "Writes", "Emits", "Handles"])
export type EdgeType = typeof EdgeType.Type

export const FileRole = Schema.Literals(["Entrypoint", "Handler", "Service", "Repository", "Model", "Utility", "Config", "Test", "Infrastructure"])
export type FileRole = typeof FileRole.Type

export const EntrypointType = Schema.Literals(["HttpRoute", "CliCommand", "QueueConsumer", "CronJob", "ReactPage", "TestFile", "EventHandler", "EffectService"])
export type EntrypointType = typeof EntrypointType.Type

export const GroupType = Schema.Literals(["Feat", "Fix", "Perf", "Refactor", "Test", "Docs", "Build", "Ci", "Chore"])
export type GroupType = typeof GroupType.Type

export const Risk = Schema.Literals(["Low", "Medium", "High", "Critical"])
export type Risk = typeof Risk.Type

export const ImpactScope = Schema.Literals(["Local", "Module", "CrossCutting", "System"])
export type ImpactScope = typeof ImpactScope.Type

export const ReviewComplexity = Schema.Literals(["Trivial", "Simple", "Moderate", "Complex"])
export type ReviewComplexity = typeof ReviewComplexity.Type

export const ReviewFocus = Schema.Literals(["Correctness", "Security", "Concurrency", "Performance", "DataIntegrity", "Compatibility", "ErrorHandling", "ApiContract"])
export type ReviewFocus = typeof ReviewFocus.Type

export const FlowEdge = Schema.Struct({ from: Schema.String, to: Schema.String, edge_type: EdgeType })
export type FlowEdge = typeof FlowEdge.Type

export const FileChange = Schema.Struct({
  path: Schema.String,
  flow_position: Schema.Number,
  role: FileRole,
  changes: Schema.Struct({ additions: Schema.Number, deletions: Schema.Number }),
  symbols_changed: Schema.Array(Schema.String)
})
export type FileChange = typeof FileChange.Type

export const Entrypoint = Schema.Struct({ file: Schema.String, symbol: Schema.String, entrypoint_type: EntrypointType })
export type Entrypoint = typeof Entrypoint.Type

export const FlowGroup = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  entrypoint: Schema.NullOr(Entrypoint),
  files: Schema.Array(FileChange),
  edges: Schema.Array(FlowEdge),
  risk_score: Schema.Number,
  review_order: Schema.Number,
  group_type: Schema.NullOr(GroupType),
  description: Schema.NullOr(Schema.String),
  risk: Schema.NullOr(Risk),
  impact: Schema.NullOr(ImpactScope),
  complexity: Schema.NullOr(ReviewComplexity),
  review_focus: Schema.Array(ReviewFocus),
  summary: Schema.Array(Schema.String),
  invariant: Schema.NullOr(Schema.String)
})
export type FlowGroup = typeof FlowGroup.Type

export const InfrastructureGroup = Schema.Struct({
  files: Schema.Array(Schema.String),
  sub_groups: Schema.Array(Schema.Struct({ name: Schema.String, category: Schema.String, files: Schema.Array(Schema.String) })),
  reason: Schema.String
})
export type InfrastructureGroup = typeof InfrastructureGroup.Type

export const AnalysisOutput = Schema.Struct({
  version: Schema.String,
  diff_source: Schema.Struct({
    diff_type: Schema.Literals(["BranchComparison", "CommitRange", "Staged", "Unstaged", "Worktree", "BranchWithWorktree"]),
    base: Schema.NullOr(Schema.String),
    head: Schema.NullOr(Schema.String),
    base_sha: Schema.NullOr(Schema.String),
    head_sha: Schema.NullOr(Schema.String)
  }),
  summary: Schema.Struct({
    total_files_changed: Schema.Number,
    total_groups: Schema.Number,
    languages_detected: Schema.Array(Schema.String),
    frameworks_detected: Schema.Array(Schema.String)
  }),
  groups: Schema.Array(FlowGroup),
  infrastructure_group: Schema.NullOr(InfrastructureGroup),
  annotations: Schema.NullOr(Schema.Unknown)
})
export type AnalysisOutput = typeof AnalysisOutput.Type

export const FileDiffContent = Schema.Struct({
  path: Schema.String,
  old_content: Schema.String,
  new_content: Schema.String,
  language: Schema.String
})
export type FileDiffContent = typeof FileDiffContent.Type

// One review as the dashboard receives it: Diffcore's analysis, the contents of each
// changed file, and which agents wrote each file (a dashboard field outside Diffcore).
export const MergeReview = Schema.Struct({
  analysis: AnalysisOutput,
  files: Schema.Array(FileDiffContent),
  authors: Schema.Record(Schema.String, Schema.Array(Schema.String))
})
export type MergeReview = typeof MergeReview.Type

export const decodeReview = Schema.decodeUnknownSync(MergeReview)

// What a review covers: everything a merge put on main, or one agent's branch.
export type ReviewSubject =
  | { readonly kind: "merge"; readonly taskId: string }
  | { readonly kind: "branch"; readonly agentId: string }
