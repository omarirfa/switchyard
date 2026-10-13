# Switchyard agent desk

React and Effect dashboard for the Cloudflare "Build the Next-Gen Git Platform" entry. It shows a coordinator assigning branches to AI agents, the agents' commits and tests, conflicts between their branches, and the coordinator's merge decisions. The same screen works for 3 agents and for 10,000, and changes its layout by itself as the count grows.

## Run

The project uses pnpm, pinned to 10.28.0 in the `packageManager` field of `package.json`. Run `corepack enable` once and Corepack installs that version.

```sh
pnpm install
pnpm dev         # local dev server
pnpm build       # writes dist/index.html as one self-contained file
pnpm check       # TypeScript
```

The preview plays one sample run that grows from a few agents to 10,000. Two scripted tasks open it: three agents compete on a rate limit (a variant set), then three agents split a team invites feature. A seeded simulator then adds agents across 40 workstreams until the run reaches 10,000, about 65 seconds in. The top bar shows the live agent count, and the rewind slider returns to any earlier moment, including the small-run views.

The coordinator picks each task's mode by risk, following the "spend by risk" rule in the design notes:

| Mode | When | Agents |
|---|---|---|
| Single attempt | Low-risk changes, the default | One agent |
| Split task | A change that spans files separate agents can own | Two to four agents, one subtask each |
| Variant set | High-risk workstreams (auth, SSO, permissions, payments, billing, migrations), and every retry after a failed single attempt | Three to five competing agents; the coordinator merges the passing attempt with the smallest change |

Each task carries the reason for its mode, shown in the workstream panel, the agent drawer, and Compare attempts.

## Views

A Needs attention strip sits under the tabs on every tab. It holds eight slots in a fixed order, from the most urgent to the least: failing tests, open conflicts, questions for owners, contracts to approve, blocked agents, stalled agents, tasks ready to merge, and files in three or more branches. A slot with nothing in it stays in place and dims, so the slots never move. Each slot opens the work behind it.

The screen groups panels into four tabs by job. The address bar keeps the open tab (`#overview`, `#work`, `#decisions`, `#system`).

| Tab | Panels |
|---|---|
| Overview | Run header and summary numbers, coordinator figure, Activity, Merge queue figure |
| Work | Agents, Compare attempts, Event log, Overlap warnings, Conflicts, Branch graph for small runs |
| Decisions | Decision inbox, Intent contracts, Attention budget, Merge decisions, Precedents, Earned autonomy |
| System | System map built from the run, Since you last looked, Churn and attention, Behavior changes |

Every chip under the coordinator figure opens what it names: an agent's details in a small run, a workstream panel in a fleet, or a list of the remaining workstreams. Each rail in the Merge queue figure opens its agent or product area. The workstream panel shows tasks in progress with their agents, who is working now, questions waiting on the owner, conflicts, overlapping files, and recent merges.

Answers and contract approvals in the Decisions tab stay in the page and say so. The "last looked" marker is saved in this browser per sample run.

## Code review for merges and branches

Every merge and every agent branch opens a code review panel. The panel opens from the Merge decisions panel, the `main` chip on the Merge queue figure, the agent drawer, the Compare attempts table, a workstream's recent merges, and each behavior change card.

The panel reads one JSON document per merge or branch in the shape that [Diffcore](https://github.com/jamesaphoenix/diff-core) (MIT) writes with `diffcore analyze -o review.json`, plus each changed file's old and new contents, as Diffcore's desktop app reads them. `src/domain/Review.ts` defines that shape with Effect `Schema` and decodes every review through it. The panel shows:

- flow groups in Diffcore's review order, each with its files in flow order, file roles, and line counts
- the group's review notes: change type, risk, impact, review effort, focus areas, a one-line description, the invariant to check while reading, and summary lines
- a line-art flow graph of the files in the group and the imports between them
- one file's diff at a time, unified or side by side, with keys j and k for files, J and K for groups, and x to mark a file reviewed

In this preview `src/domain/Analyze.ts` builds the Diffcore-shaped analysis in the browser: file roles from paths, import edges, forward reachability from entrypoints, a risk score, and review order. The two 3-agent samples use hand-written code in `src/data/sampleCode.ts`. Fleet agents get code generated from their task verb and files in `src/data/synthCode.ts`, built only when someone opens a review. A live Worker would run `diffcore analyze --base main --head <branch> -o review.json` per merge and send that file with the file contents; the panel would not change.

## System map

The map builds itself from the run. Nothing about its boxes or links is fixed:

- **Nodes:** every file an intent contract assigns, every file a commit changes, and every file that changed code imports. A file that a contract assigned but no agent has changed yet has a dashed outline.
- **Links:** imports read from the code of each changed file, drawn from the importer to the file it imports. Columns run left to right from callers to what they call.
- **Zoom:** the top level shows product areas and shared code. Selecting a box zooms in to workstreams, then folders, then files, and a breadcrumb leads back. Nodes outside the zoomed scope stay one level coarser on the right.
- **Change overlay:** each box shows how many of its files changed since the "last looked" marker and how many are new, with brighter boxes for a larger share. Imports added since the marker are drawn as moving dashed lines.
- **Clicks:** selecting a link or a file opens the change behind it: the merge's code review when the coordinator merged it, otherwise the agent's details.

## How the screen scales

Every panel picks a form that stays readable as the agent count grows:

Every card stays in place as the run grows. A few cards change form or hide once the count passes the point where they stay readable:

| Panel | Small run (up to 6 to 12 agents) | Fleet |
|---|---|---|
| Coordinator figure | One tile per agent | One tile per workstream for the 7 largest, plus one tile for the rest |
| Merge queue figure | One rail per agent | One rail per product area. Main grows one plate per doubling of merges |
| Decision inbox | Each question | Questions from several agents in one workstream share a card. Repeated answers collapse into one row |
| System map | Every file and import in the run | Same graph, shown one level at a time: areas, then workstreams, then folders, then files, so each level stays under a few dozen boxes |
| Needs attention | Same | Counts of open conflicts, failing agents, stalled agents, blocked agents, three-way file overlaps, and tasks ready to merge. Each one filters the agent table. |
| Activity | One lane per agent, with a Totals view | Stacked area of working, testing, and blocked agents over time, with a table view |
| Agents | One card per agent | Virtualized table (only visible rows render) with search, state filters, workstream filter, and sort |
| Agent details | Drawer with plan, commits and files, tests, conflicts, merge verdict, competing attempts, and full history | Same |
| Compare attempts | The run's attempts side by side | Picker over recent parallel tasks |
| Overlap warnings | Files two merge units edit at once | The 8 busiest files plus a total |
| Event log | Full log | Latest 200 events |
| Rewind | Replays the run to any moment | Same, replay finishes in under 100 ms for 10,000 agents |
| Code review | Every file of the merge | Same; a review is built when opened, in under 1 ms for a typical fleet merge |

## How the code fits together

- `src/domain/Events.ts` defines the coordination events with Effect `Schema`, including contracts, decision questions and answers, reverts, and behavior changes.
- `src/domain/Areas.ts` maps workstreams to eight product areas and marks high-risk workstreams.
- `src/domain/CodeGraph.ts` builds the system map from the event log. Files that contracts assign or commits change become nodes, and the imports read from each changed file become links. Files that changed code imports but no task changed are shared code on main. A rejected attempt's files and imports leave the map unless another branch or a contract still holds them. The graph updates with each batch of events, and `levelOf` groups it by zoom level.
- `src/domain/Fleet.ts` holds `FleetStore`. Each event updates counters and indexes in constant time apart from the files a commit touches, so the store never rescans every agent to draw a view. `view()` returns an immutable snapshot of counters, bounded top lists, and the latest 200 events. `query()` filters and sorts the agent table. `replay()` rebuilds the store up to a moment for rewind.
- `src/domain/Timeline.ts` builds per-agent lanes for small runs.
- `src/data/RunEvents.ts` is an Effect service that streams events in batches. The 3-agent scripts in `src/data/sampleRuns.ts` decode every event through the schema. `src/data/simulate.ts` generates the 10,000-agent run from a fixed seed.
- `src/state/atoms.ts` folds the stream into a `FleetStore` with Effect Atom and publishes one view per batch.
- `src/ui/` renders the screen. `src/ui/figure/` draws the coordinator figure in Hairline's style with projection helpers ported from [Hairline](https://github.com/lucasmarkes/hairline) (MIT). Icons come from [Phosphor](https://phosphoricons.com) (MIT).

## Beyond one browser

The preview keeps the whole store in the browser, which holds 10,000 agents comfortably. For millions of agents the same split moves to the server: one `FleetStore` per workstream in a Durable Object, a coordinator that merges their counters and top lists, and a dashboard that receives views and paged table queries over a WebSocket. The UI already reads only views and queries, so it does not change.

## Sample data

Every value on screen comes from `src/data/sampleRuns.ts` and `src/data/simulate.ts`. `FILLER_ITEMS.md` lists each field and the live source that must replace it.
