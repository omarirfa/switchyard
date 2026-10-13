
// SAMPLE DATA. Scripted events for the preview. Every value below is invented
// for layout testing. The live Worker feed replaces this file; see FILLER_ITEMS.md.

export interface ScriptedEvent {
  readonly delayMs: number
  readonly event: unknown
}

const at = (ms: number, event: Record<string, unknown>): { at: number } & Record<string, unknown> => ({
  ...event,
  at: ms
})

const script = (events: ReadonlyArray<{ at: number }>): ReadonlyArray<ScriptedEvent> =>
  events.map((event, i) => ({ delayMs: i === 0 ? 0 : event.at - events[i - 1]!.at, event }))

const parallel = script([
  at(0, { _tag: "RunStarted", runId: "sample-parallel", kind: "parallel", title: "Add rate limiting to POST /api/upload" }),
  at(100, { _tag: "TaskCreated", taskId: "t-upload-limit", group: "uploads", title: "Add rate limiting to POST /api/upload", mode: "parallel", reason: "Retry: a single attempt timed out under load, so three setups compete on the second try." }),
  at(150, { _tag: "ContractSubmitted", taskId: "t-upload-limit", goal: "Uploads over 60 per minute per user return 429.", constraints: ["Adds no new dependencies.", "Touches only the files in scope."], files: ["src/routes/upload.ts", "wrangler.jsonc"], tests: ["The 61st upload in a minute returns 429", "The limit holds across locations"], risk: "low" }),
  at(200, { _tag: "ContractApproved", taskId: "t-upload-limit", by: "coordinator", edited: false }),
  at(300, { _tag: "AgentAssigned", taskId: "t-upload-limit", group: "uploads", setup: "k-12", agentId: "A", branch: "attempt/a-durable-object", task: "Add rate limiting to POST /api/upload", intent: "Count requests per user in a Durable Object so the limit holds across every location." }),
  at(450, { _tag: "AgentAssigned", taskId: "t-upload-limit", group: "uploads", setup: "m-7", agentId: "B", branch: "attempt/b-kv-counter", task: "Add rate limiting to POST /api/upload", intent: "Store a per-minute counter in Workers KV to keep the change small." }),
  at(600, { _tag: "AgentAssigned", taskId: "t-upload-limit", group: "uploads", setup: "m-8", agentId: "C", branch: "attempt/c-limit-binding", task: "Add rate limiting to POST /api/upload", intent: "Use the Workers rate limiting binding and add no new storage." }),
  at(900, { _tag: "AgentStatusChanged", agentId: "A", status: "working", note: "Reading src/routes/upload.ts" }),
  at(1000, { _tag: "AgentStatusChanged", agentId: "B", status: "working", note: "Reading src/routes/upload.ts" }),
  at(1100, { _tag: "AgentStatusChanged", agentId: "C", status: "working", note: "Reading wrangler.jsonc" }),
  at(1800, { _tag: "DecisionRequested", decisionId: "d-upload-scope", agentId: "B", group: "uploads", question: "Should the upload limit count per user or per API key?", options: [{ label: "Per user", cost: "Shared keys share one limit", risk: "low" }, { label: "Per API key", cost: "One user can open many keys", risk: "medium" }], recommended: 0, assumption: "Count per user.", urgent: false }),
  at(2600, { _tag: "CommitPushed", agentId: "A", sha: "a41c9e2", message: "Add RateLimiter Durable Object", files: ["src/limiter.ts", "wrangler.jsonc"], additions: 22, deletions: 0 }),
  at(2900, { _tag: "DecisionAnswered", decisionId: "d-upload-scope", choice: 0, by: "owner", scope: "every uploads task" }),
  at(3000, { _tag: "CommitPushed", agentId: "C", sha: "7d02b1f", message: "Bind UPLOAD_LIMITER in wrangler config", files: ["wrangler.jsonc"], additions: 3, deletions: 0 }),
  at(3400, { _tag: "CommitPushed", agentId: "B", sha: "e93a0c4", message: "Add KV request counter", files: ["src/kv-counter.ts", "src/routes/upload.ts"], additions: 11, deletions: 0 }),
  at(4200, { _tag: "CommitPushed", agentId: "A", sha: "c1f5d77", message: "Call limiter from upload route", files: ["src/routes/upload.ts"], additions: 7, deletions: 0 }),
  at(4500, { _tag: "CommitPushed", agentId: "C", sha: "0b8e6aa", message: "Return 429 from upload route", files: ["src/routes/upload.ts", "test/upload.test.ts"], additions: 27, deletions: 0 }),
  at(4800, { _tag: "AgentStatusChanged", agentId: "A", status: "testing", note: "Running 24 tests" }),
  at(5000, { _tag: "AgentStatusChanged", agentId: "B", status: "testing", note: "Running 24 tests" }),
  at(5200, { _tag: "AgentStatusChanged", agentId: "C", status: "testing", note: "Running 24 tests" }),
  at(6400, { _tag: "TestsFinished", agentId: "B", passed: 22, failed: 2 }),
  at(6500, { _tag: "AgentStatusChanged", agentId: "B", status: "failed", note: "KV writes take time to reach other locations, so a burst of requests passes the limit." }),
  at(6900, { _tag: "TestsFinished", agentId: "A", passed: 24, failed: 0 }),
  at(7000, { _tag: "AgentStatusChanged", agentId: "A", status: "done", note: "All tests pass" }),
  at(7300, { _tag: "TestsFinished", agentId: "C", passed: 24, failed: 0 }),
  at(7400, { _tag: "AgentStatusChanged", agentId: "C", status: "done", note: "All tests pass" }),
  at(8200, { _tag: "MergeDecided", taskId: "t-upload-limit", merged: ["C"], rejected: ["A", "B"], targetSha: "5f3a9c0", reason: "A and C pass all 24 tests. C changes 30 lines and adds no new storage. A changes 29 lines and adds a Durable Object with a storage migration. B fails 2 tests." }),
  at(8400, { _tag: "BehaviorDiff", taskId: "t-upload-limit", agentId: "C", title: "61st upload in one minute", request: "POST /api/upload  61st request this minute", before: "200, file stored", after: "429 rate_limited, retry-after 60s", contract: "Uploads over 60 per minute per user return 429." })
])

const split = script([
  at(0, { _tag: "RunStarted", runId: "sample-split", kind: "split", title: "Add team invites" }),
  at(100, { _tag: "TaskCreated", taskId: "t-team-invites", group: "teams", title: "Add team invites", mode: "split", reason: "The change spans the API, the data model and a page, which separate agents can own." }),
  at(150, { _tag: "ContractSubmitted", taskId: "t-team-invites", goal: "Owners invite people to a team with a role, and see pending invites.", constraints: ["Invite links expire after 7 days.", "Keeps the public API unchanged."], files: ["src/routes/invites.ts", "src/types/member.ts", "src/pages/members.tsx"], tests: ["An expired invite link returns 410", "Editors see pending invites with role and expiry"], risk: "low" }),
  at(200, { _tag: "ContractApproved", taskId: "t-team-invites", by: "coordinator", edited: false }),
  at(300, { _tag: "AgentAssigned", taskId: "t-team-invites", group: "teams", setup: "k-12", agentId: "D", branch: "split/d-invite-api", task: "Add POST /api/invites", intent: "Create the invite record and return a signed link that expires after 7 days." }),
  at(450, { _tag: "AgentAssigned", taskId: "t-team-invites", group: "teams", setup: "m-8", agentId: "E", branch: "split/e-member-roles", task: "Add member roles to the data model", intent: "Add a MemberRole type so an invite can grant viewer or editor access." }),
  at(600, { _tag: "AgentAssigned", taskId: "t-team-invites", group: "teams", setup: "m-7", agentId: "F", branch: "split/f-members-page", task: "List pending invites on the Members page", intent: "Show each pending invite with its role and expiry date." }),
  at(900, { _tag: "AgentStatusChanged", agentId: "D", status: "working", note: "Writing src/routes/invites.ts" }),
  at(1000, { _tag: "AgentStatusChanged", agentId: "E", status: "working", note: "Editing src/types/member.ts" }),
  at(1100, { _tag: "AgentStatusChanged", agentId: "F", status: "working", note: "Editing src/pages/members.tsx" }),
  at(2000, { _tag: "DecisionRequested", decisionId: "d-invite-email", agentId: "F", group: "teams", question: "Should pending invites show the inviter's email address?", options: [{ label: "Show the email", cost: "Exposes addresses to all members", risk: "medium" }, { label: "Show the name only", cost: "Harder to tell people apart", risk: "low" }], recommended: 1, assumption: "Show the inviter's name only.", urgent: false }),
  at(2500, { _tag: "CommitPushed", agentId: "E", sha: "3c7e019", message: "Add MemberRole type", files: ["src/types/member.ts"], additions: 3, deletions: 1 }),
  at(3000, { _tag: "DecisionAnswered", decisionId: "d-invite-email", choice: 1, by: "owner", scope: "every teams task" }),
  at(3100, { _tag: "CommitPushed", agentId: "D", sha: "b20f4d8", message: "Add invites route and signed links", files: ["src/routes/invites.ts", "src/lib/sign.ts"], additions: 46, deletions: 0 }),
  at(3600, { _tag: "CommitPushed", agentId: "F", sha: "e6a1c35", message: "Add pending invites list", files: ["src/pages/members.tsx", "src/types/member.ts"], additions: 23, deletions: 1 }),
  at(4300, { _tag: "ConflictDetected", conflictId: "conflict-1", agentIds: ["E", "F"], file: "src/types/member.ts", detail: "E defines role as MemberRole. F defines role as a plain string." }),
  at(4400, { _tag: "AgentStatusChanged", agentId: "F", status: "blocked", note: "Waiting for the conflict in src/types/member.ts" }),
  at(4600, { _tag: "AgentStatusChanged", agentId: "D", status: "testing", note: "Running 18 tests" }),
  at(4800, { _tag: "AgentStatusChanged", agentId: "E", status: "testing", note: "Running 12 tests" }),
  at(5600, { _tag: "ConflictResolved", conflictId: "conflict-1", resolution: "Kept the MemberRole type from E. Rebased F onto E and changed its role field to MemberRole." }),
  at(5700, { _tag: "AgentStatusChanged", agentId: "F", status: "working", note: "Rebasing onto split/e-member-roles" }),
  at(6000, { _tag: "TestsFinished", agentId: "E", passed: 12, failed: 0 }),
  at(6100, { _tag: "AgentStatusChanged", agentId: "E", status: "done", note: "All tests pass" }),
  at(6300, { _tag: "TestsFinished", agentId: "D", passed: 18, failed: 0 }),
  at(6400, { _tag: "AgentStatusChanged", agentId: "D", status: "done", note: "All tests pass" }),
  at(6700, { _tag: "CommitPushed", agentId: "F", sha: "41d8f72", message: "Use MemberRole in invite list", files: ["src/pages/members.tsx"], additions: 3, deletions: 2 }),
  at(6900, { _tag: "AgentStatusChanged", agentId: "F", status: "testing", note: "Running 9 tests" }),
  at(7700, { _tag: "TestsFinished", agentId: "F", passed: 9, failed: 0 }),
  at(7800, { _tag: "AgentStatusChanged", agentId: "F", status: "done", note: "All tests pass" }),
  at(8500, { _tag: "MergeDecided", taskId: "t-team-invites", merged: ["E", "D", "F"], rejected: [], targetSha: "9be12d4", reason: "All three subtasks pass their tests. E merges first because D and F import MemberRole." }),
  at(8700, { _tag: "BehaviorDiff", taskId: "t-team-invites", agentId: "F", title: "Members page as an editor", request: "GET /members  role=editor", before: "3 members", after: "3 members and 2 pending invites with role and expiry", contract: "Owners and editors see pending invites." })
])

export const sampleRuns = { parallel, split } as const
