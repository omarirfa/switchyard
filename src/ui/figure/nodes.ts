import type { AgentStatus } from "../../domain/Events.ts"
import type { Counts, FleetView, GroupRec, Outcome } from "../../domain/Fleet.ts"
import { full, plural, stateLabel, stateOf } from "../format.ts"
import type { FigureArc, FigureNode } from "./CoordinatorFigure.tsx"

// The figure shows one tile per agent up to this many agents, then one tile per workstream.
export const AGENT_TILES_MAX = 8
const GROUP_TILES = 7

export interface LegendItem {
  readonly id: string
  readonly name: string
  readonly state: AgentStatus | Outcome
  readonly stateText: string
  readonly detail: string
}

export interface FigureModel {
  readonly mode: "agents" | "groups"
  readonly nodes: ReadonlyArray<FigureNode>
  readonly arcs: ReadonlyArray<FigureArc>
  readonly legend: ReadonlyArray<LegendItem>
  readonly hidden: number
  readonly label: string
}

const dominant = (c: Counts, agents: number): AgentStatus => {
  const live = c.working + c.testing + c.blocked
  if (c.blocked > 0 && c.blocked >= Math.max(1, live * 0.08)) return "blocked"
  if (c.testing > c.working) return "testing"
  if (c.working > 0) return "working"
  if (c.queued > 0) return "queued"
  return c.failed > agents / 2 ? "failed" : "done"
}

const groupNode = (g: GroupRec): FigureNode => {
  const live = g.counts.working + g.counts.testing + g.counts.blocked
  const decided = g.agents > 0 && g.merged + g.rejected === g.agents
  return {
    id: g.name,
    status: dominant(g.counts, g.agents),
    outcome: decided && g.merged > 0 ? "merged" : undefined,
    plates: 0,
    lift: Math.min(1, (live / Math.max(1, g.agents)) * 2.5),
    punches: 0,
    commits: g.commits
  }
}

export const figureModel = (v: FleetView): FigureModel => {
  const store = v.store
  if (v.agents <= AGENT_TILES_MAX) {
    const nodes = store.order.flatMap((id, i): Array<FigureNode> => {
      const rec = store.agents.get(id)
      if (rec === undefined) return []
      return [{
        id,
        status: rec.status,
        outcome: rec.outcome,
        plates: rec.commits.length,
        lift: rec.status === "working" || rec.status === "testing" ? 1 : 0,
        punches: Math.min(i + 1, 4),
        commits: rec.commits.length
      }]
    })
    const arcs = [...store.conflicts.values()].flatMap((c): Array<FigureArc> => {
      const [a, b] = c.agentIds
      return a === undefined || b === undefined ? [] : [{ id: c.conflictId, a, b, open: c.to === undefined }]
    })
    const legend = store.order.flatMap((id): Array<LegendItem> => {
      const rec = store.agents.get(id)
      if (rec === undefined) return []
      const s = stateOf(rec)
      return [{ id, name: id, state: s, stateText: stateLabel(s), detail: plural(rec.commits.length, "commit") }]
    })
    const label = legend.length === 0
      ? "Coordinator with no agents yet"
      : `Coordinator and ${legend.length} agents. ${legend.map((l) => `Agent ${l.name} ${l.stateText.toLowerCase()}, ${l.detail}`).join("; ")}.`
    return { mode: "agents", nodes, arcs, legend, hidden: 0, label }
  }

  const byAgents = [...v.groups].sort((a, b) => b.agents - a.agents || a.name.localeCompare(b.name))
  const shown = byAgents.slice(0, GROUP_TILES).sort((a, b) => a.name.localeCompare(b.name))
  const rest = byAgents.slice(GROUP_TILES)
  const nodes = shown.map(groupNode)
  if (rest.length > 0) {
    const counts: Counts = { queued: 0, working: 0, testing: 0, blocked: 0, done: 0, failed: 0 }
    let agents = 0
    let commits = 0
    let merged = 0
    let rejected = 0
    for (const g of rest) {
      for (const k of Object.keys(counts) as Array<AgentStatus>) counts[k] += g.counts[k]
      agents += g.agents
      commits += g.commits
      merged += g.merged
      rejected += g.rejected
    }
    nodes.push(groupNode({ name: "other", agents, counts, merged, rejected, commits, openConflicts: 0, lastAt: 0 }))
  }
  // Plate height compares the named workstreams with each other: the busiest stands six
  // plates tall. The combined "more" tile is capped at the same height.
  const maxCommits = Math.max(1, ...nodes.filter((n) => n.id !== "other").map((n) => n.commits))
  for (let i = 0; i < nodes.length; i++) {
    nodes[i] = { ...nodes[i]!, plates: Math.min(6, 1 + (5 * nodes[i]!.commits) / maxCommits) }
  }
  const restAgents = rest.reduce((s, r) => s + r.agents, 0)
  const restLive = rest.reduce((s, r) => s + r.counts.working + r.counts.testing + r.counts.blocked, 0)
  const legend = nodes.map((n): LegendItem => {
    const g = shown.find((s) => s.name === n.id)
    const agents = g?.agents ?? restAgents
    const live = g === undefined ? restLive : g.counts.working + g.counts.testing + g.counts.blocked
    const state = n.outcome ?? n.status
    return {
      id: n.id,
      name: n.id === "other" ? `${rest.length} more` : n.id,
      state,
      stateText: stateLabel(state),
      detail: `${full(live)} of ${full(agents)} active`
    }
  })
  return {
    mode: "groups",
    nodes,
    arcs: [],
    legend,
    hidden: rest.length,
    label: `Coordinator and ${v.groups.length} workstreams, the ${shown.length} largest shown as tiles. ${legend.map((l) => `${l.name}: ${l.detail}`).join("; ")}.`
  }
}
