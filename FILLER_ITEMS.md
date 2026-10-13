# Filler items without a live data source

The preview reads every value below from `src/data/sampleRuns.ts` (two 3-agent scripts) or `src/data/simulate.ts` (a seeded 10,000-agent simulation). No Worker, Durable Object, or Artifacts repo supplies these values yet. The `RunEvents.live` layer must replace each row before the demo video.

| Screen area | Field | Sample source | Live source to build |
|---|---|---|---|
| Header | Run title, kind, run ID | `RunStarted` | The run the user starts on the Worker |
| Header | Task titles, workstreams, task mode | `TaskCreated` | Tasks the coordinator creates or receives |
| Summary numbers | Active agents, commits, lines, tests passed, tasks decided, open conflicts, elapsed time | Computed by `FleetStore` from sample events | Same computation over the live feed |
| Coordinator figure | Tiles, plates, lift, links, packets, conflict arcs, docking | Derived from the store by `src/ui/figure/nodes.ts` | Same derivation over the live feed |
| Needs attention | Counts and the agents behind each count | Computed by `FleetStore.attention` | Same computation over the live feed |
| Run growth | Agent count over time, from 6 scripted agents to 10,000 | `RunEvents.ts` joins `sampleRuns.ts` and `simulate.ts`; the simulator ramps agents with the square root of time | Agents the live coordinator starts |
| Task modes | Mode per task and the reason | `TaskCreated.mode` and `TaskCreated.reason` from the simulator's risk rule and the two scripts | The coordinator's own mode choice |
| Activity | Status counts over time, per-agent lanes | `FleetStore.history`, `src/domain/Timeline.ts` | Same derivation over the live feed |
| Agents | Agent ID, workstream, branch, task, plan, current step, status | `AgentAssigned`, `AgentStatusChanged` | Agents the coordinator Worker assigns, and their status updates |
| Agents | Commits, files, line counts | `CommitPushed` | Commits read from each agent's Artifacts branch |
| Agents | Test counts | `TestsFinished` | Test runner results per branch |
| Compare attempts | Attempts per parallel task and the winner | Tasks and `MergeDecided` | Same, from the live feed |
| Overlap warnings | Files open in two or more merge units | `FleetStore.hotFiles` over sample commits | Same computation over live commits |
| Conflicts | File, agents, detail, resolution | `ConflictDetected`, `ConflictResolved` | Overlap check and resolver results |
| Merge decisions | Merged and rejected agents, reason, target SHA | `MergeDecided` | Worker merge step and the resulting commit on main |
| Event log | Latest 200 events | Sample events | Live feed |
| Intent contracts | Goal, limits, files, tests, risk, approver, edits | `ContractSubmitted`, `ContractApproved` from templates in `simulate.ts` | Contracts the coordinator drafts and owners approve |
| Decision inbox | Question, options with cost and risk, recommended option, assumption, urgency | `DecisionRequested` from per-area templates in `simulate.ts` | Questions agents raise during a task |
| Decision inbox | Answers and who answered | `DecisionAnswered` (owner, precedent, or default after wait) | Owner answers and the precedent lookup |
| Precedents | Question, answer, scope | Owner answers in the sample run | Stored precedents with review dates |
| Attention budget | Daily limit of 20, 20 second review windows, 18 second maximum wait | Constants in `DecisionsTab.tsx` and `simulate.ts` | Each owner's settings |
| Earned autonomy | Setups k-12, k-13, m-7, m-8, pass rates, reverts, area risk levels, thresholds | `AgentAssigned.setup`, `MergeReverted`, constants in `DecisionsTab.tsx` | Agent setup versions and the team's autonomy policy |
| System map | Files, folders, workstreams, and import links | Built by `CodeGraph.ts` from sample contracts, commits, and the sample code in `codeSource.ts` | The same graph, built from contracts, commits, and file contents on each agent's Artifacts branch |
| Behavior changes | Title, request, before, after, contract | `BehaviorDiff` from templates in `simulate.ts` | Behavior checks recorded at merge time |
| Owners | "Accounts owner" and the other area owners | `ownerOf` in `Areas.ts` | Named owners from the team directory |
| Code review | File contents before and after each merge or branch | `src/data/sampleCode.ts` (3-agent samples) and `src/data/synthCode.ts` (fleet templates) | Old and new contents read from each agent's Artifacts branch |
| Code review | Flow groups, roles, edges, risk, review order | Built in the browser by `src/domain/Analyze.ts` | `diffcore analyze --base main --head <branch> -o review.json` on the Worker |
| Code review | Description, invariant, focus, summary per group | `SAMPLE_META` in `sampleCode.ts` and per-verb templates in `synthCode.ts` | Diffcore's metadata pass |
| Agent drawer | Commit line counts in the 3-agent samples | Match the sample code in `sampleCode.ts` | Commit stats from git |

Churn and attention counts panel opens in this browser session, so it has a real source. The Hairline Branches figure in the merge panel is an illustration. It shows no run data, so it needs no live source.
