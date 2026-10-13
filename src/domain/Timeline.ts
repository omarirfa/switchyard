import type { AgentStatus } from "./Events.ts"
import type { FleetStore } from "./Fleet.ts"

export interface Segment {
  readonly status: AgentStatus
  readonly from: number
  readonly to: number
}

export interface CommitMark {
  readonly at: number
  readonly sha: string
  readonly message: string
}

export interface AgentTrack {
  readonly agentId: string
  readonly assignedAt: number
  readonly segments: ReadonlyArray<Segment>
  readonly commits: ReadonlyArray<CommitMark>
  readonly endedAt: number | undefined
  readonly endStatus: "done" | "failed" | undefined
}

export interface ConflictSpan {
  readonly conflictId: string
  readonly agentIds: ReadonlyArray<string>
  readonly file: string
  readonly from: number
  readonly to: number | undefined
}

export interface Lanes {
  readonly now: number
  readonly domain: number
  readonly tracks: ReadonlyArray<AgentTrack>
  readonly conflicts: ReadonlyArray<ConflictSpan>
  readonly mergeAt: number | undefined
}

// Axis length: 10 second minimum, then whole steps that rescale rarely during a live run.
export const niceDomain = (now: number): number => {
  if (now <= 10_000) return 10_000
  const step = now <= 60_000 ? 15_000 : now <= 300_000 ? 60_000 : 300_000
  return Math.ceil(now / step) * step
}

// Per-agent status intervals for small runs, rebuilt from each agent's own event list.
// `now` extends open intervals past the last event, so bars keep growing between events.
export const lanes = (store: FleetStore, now: number): Lanes => {
  const tracks: Array<AgentTrack> = []
  let mergeAt: number | undefined
  for (const id of store.order) {
    const rec = store.agents.get(id)
    if (rec === undefined) continue
    const segments: Array<Segment> = []
    let open: { status: AgentStatus; from: number } | undefined = { status: "queued", from: rec.assignedAt }
    let endedAt: number | undefined
    let endStatus: "done" | "failed" | undefined
    for (const i of rec.events) {
      const e = store.log[i]
      if (e === undefined || e._tag !== "AgentStatusChanged") continue
      if (open !== undefined) segments.push({ status: open.status, from: open.from, to: e.at })
      if (e.status === "done" || e.status === "failed") {
        open = undefined
        endedAt = e.at
        endStatus = e.status
      } else {
        open = { status: e.status, from: e.at }
        endedAt = undefined
        endStatus = undefined
      }
    }
    if (open !== undefined) segments.push({ status: open.status, from: open.from, to: Math.max(now, open.from) })
    tracks.push({
      agentId: id,
      assignedAt: rec.assignedAt,
      segments,
      commits: rec.commits.map((c) => ({ at: c.at, sha: c.sha, message: c.message })),
      endedAt,
      endStatus
    })
  }
  for (const d of store.decisions) mergeAt = Math.max(mergeAt ?? 0, d.at)
  const conflicts: Array<ConflictSpan> = [...store.conflicts.values()].map((c) => ({
    conflictId: c.conflictId,
    agentIds: c.agentIds,
    file: c.file,
    from: c.from,
    to: c.to
  }))
  return { now, domain: niceDomain(now), tracks, conflicts, mergeAt }
}
