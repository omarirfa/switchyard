import { type Area, areaOf } from "./Areas.ts"
import type { FleetStore } from "./Fleet.ts"

// The system map, built from the run itself. Every file an intent contract assigns or a
// commit changes becomes a node; every import in a changed file becomes an edge to the
// file it imports. Files that changed code imports, but no task touched, are shared
// code that already exists on main. The builder reads the event log incrementally, the
// way a Worker would rebuild only the parts of the map that a merge changed.

export interface FileInfo {
  readonly path: string
  // The workstream and product area that own the file; shared files have neither.
  group: string | undefined
  area: Area | "shared"
  readonly firstAt: number
  assignedAt: number | undefined
  changedAt: number | undefined
  changes: number
  lastAgent: string | undefined
  lastTask: string | undefined
  // Agents whose branches change the file. A rejected attempt leaves this set, and a
  // file nobody assigned, changes, or imports leaves the map.
  readonly agents: Set<string>
  importers: number
}

export interface DepEdge {
  readonly from: string
  readonly to: string
  readonly firstAt: number
  // True when the import first appears in an agent's change, false when main had it.
  readonly added: boolean
  readonly agentId: string
  readonly taskId: string
  readonly agents: Set<string>
}

export interface FileContext {
  readonly path: string
  readonly taskId: string
  readonly agentId: string
  readonly group: string
  readonly title: string
  readonly files: ReadonlyArray<string>
}

// Supplies a changed file's contents before and after the change.
export type ContentSource = (ctx: FileContext) => { readonly before: string; readonly after: string } | undefined

export const dirOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf("/")))
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1)

// Relative imports resolved to repo paths. Package imports (hono, react) are left out.
export const importsIn = (path: string, content: string): Array<string> => {
  const out: Array<string> = []
  for (const m of content.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
    const parts = dirOf(path).split("/").filter(Boolean)
    for (const seg of m[1]!.split("/")) {
      if (seg === "..") parts.pop()
      else if (seg !== ".") parts.push(seg)
    }
    const target = parts.join("/")
    out.push(/\.[a-z]+$/.test(target) ? target : `${target}.ts`)
  }
  return out
}

// Two paths sit in the same workstream folder when their first two segments match,
// such as src/auth/core/service.ts and src/auth/core/types.ts.
const sameRoot = (a: string, b: string) => a.split("/").slice(0, 2).join("/") === b.split("/").slice(0, 2).join("/")

// Imports depend only on a file's contents, which depend only on the task, agent, path,
// and the agent's file list, so every graph (live or rewound) can share this cache.
const importCache = new Map<string, { readonly before: ReadonlyArray<string>; readonly after: ReadonlyArray<string> }>()

export class CodeGraph {
  readonly files = new Map<string, FileInfo>()
  readonly edges = new Map<string, DepEdge>()
  private readonly edgesByAgent = new Map<string, Array<string>>()
  private consumed = 0
  version = 0

  constructor(private readonly content: ContentSource) {}

  private file(path: string, at: number): FileInfo {
    let f = this.files.get(path)
    if (f === undefined) {
      f = { path, group: undefined, area: "shared", firstAt: at, assignedAt: undefined, changedAt: undefined, changes: 0, lastAgent: undefined, lastTask: undefined, agents: new Set(), importers: 0 }
      this.files.set(path, f)
    }
    return f
  }

  private own(f: FileInfo, group: string) {
    if (f.group !== undefined) return
    f.group = group
    f.area = areaOf(group)
  }

  // Reads the events the store has gained since the last call.
  update(store: FleetStore): this {
    const log = store.log
    if (log.length === this.consumed) return this
    for (let i = this.consumed; i < log.length; i++) {
      const e = log[i]!
      if (e._tag === "ContractSubmitted") {
        const group = store.tasks.get(e.taskId)?.group
        if (group === undefined) continue
        for (const p of e.files) {
          const f = this.file(p, e.at)
          this.own(f, group)
          f.assignedAt ??= e.at
        }
      } else if (e._tag === "CommitPushed") {
        const rec = store.agents.get(e.agentId)
        const task = rec === undefined ? undefined : store.tasks.get(rec.taskId)
        if (rec === undefined || task === undefined) continue
        const files = [...rec.files]
        for (const p of e.files) {
          const f = this.file(p, e.at)
          this.own(f, rec.group)
          f.changedAt = e.at
          f.changes++
          f.agents.add(rec.id)
          f.lastAgent = rec.id
          f.lastTask = rec.taskId
          const ck = `${rec.taskId}|${rec.id}|${p}|${files.length}`
          let imp = importCache.get(ck)
          if (imp === undefined) {
            const c = this.content({ path: p, taskId: rec.taskId, agentId: rec.id, group: rec.group, title: task.title, files })
            imp = c === undefined ? { before: [], after: [] } : { before: importsIn(p, c.before), after: importsIn(p, c.after) }
            importCache.set(ck, imp)
          }
          const before = new Set(imp.before)
          for (const to of imp.after) {
            const key = `${p}>${to}`
            const known = this.edges.get(key)
            const mine = this.edgesByAgent.get(rec.id) ?? []
            if (mine.length === 0) this.edgesByAgent.set(rec.id, mine)
            if (known !== undefined) {
              if (!known.agents.has(rec.id)) {
                known.agents.add(rec.id)
                mine.push(key)
              }
              continue
            }
            const target = this.file(to, e.at)
            target.importers++
            // A sibling the agent imports without changing still belongs to its workstream.
            if (sameRoot(p, to) && to.split("/").length > 2) this.own(target, rec.group)
            this.edges.set(key, { from: p, to, firstAt: e.at, added: !before.has(to), agentId: rec.id, taskId: rec.taskId, agents: new Set([rec.id]) })
            mine.push(key)
          }
        }
      } else if (e._tag === "MergeDecided" && e.rejected.length > 0) {
        // A rejected branch never reaches main: its files and imports leave the map
        // unless another agent's branch or a contract still holds them.
        for (const id of e.rejected) {
          for (const key of this.edgesByAgent.get(id) ?? []) {
            const d = this.edges.get(key)
            if (d === undefined) continue
            d.agents.delete(id)
            if (d.agents.size === 0) {
              this.edges.delete(key)
              const t = this.files.get(d.to)
              if (t !== undefined) t.importers--
            }
          }
          this.edgesByAgent.delete(id)
          const rec = store.agents.get(id)
          if (rec === undefined) continue
          for (const p of rec.files) this.files.get(p)?.agents.delete(id)
        }
      }
    }
    this.consumed = log.length
    this.version++
    return this
  }
}

// One cached graph per store. A rewind builds a new store, so it gets a new graph.
const graphs = new WeakMap<FleetStore, CodeGraph>()
export const graphFor = (store: FleetStore, content: ContentSource): CodeGraph => {
  let g = graphs.get(store)
  if (g === undefined) {
    g = new CodeGraph(content)
    graphs.set(store, g)
  }
  return g.update(store)
}

// The four zoom levels: product areas, then workstreams, then folders, then files.
export type Zoom =
  | { readonly kind: "root" }
  | { readonly kind: "area"; readonly area: Area | "shared" }
  | { readonly kind: "group"; readonly group: string }
  | { readonly kind: "dir"; readonly dir: string; readonly group: string | undefined }

export interface MapNode {
  readonly key: string
  readonly label: string
  // Inside the zoomed scope, or a dependency outside it.
  readonly focus: boolean
  readonly zoom: Zoom | undefined
  readonly files: number
  readonly changedSince: number
  readonly newSince: number
  readonly assignedOnly: number
  readonly area: Area | "shared"
  readonly groups: number
  readonly path: string | undefined
  readonly lastTask: string | undefined
  readonly lastAgent: string | undefined
}

export interface MapEdge {
  readonly key: string
  readonly from: string
  readonly to: string
  readonly count: number
  readonly newSince: number
  readonly latest: DepEdge
}

export interface MapLevel {
  readonly nodes: ReadonlyArray<MapNode>
  readonly edges: ReadonlyArray<MapEdge>
  readonly files: number
}

interface Key {
  readonly key: string
  readonly label: string
  readonly zoom: Zoom | undefined
}

const areaKey = (f: FileInfo, name: (a: Area | "shared") => string): Key => ({ key: `area:${f.area}`, label: name(f.area), zoom: { kind: "area", area: f.area } })
const groupKey = (group: string): Key => ({ key: `group:${group}`, label: group, zoom: { kind: "group", group } })
const dirKey = (f: FileInfo): Key => ({ key: `dir:${dirOf(f.path)}:${f.group ?? ""}`, label: dirOf(f.path) || "/", zoom: { kind: "dir", dir: dirOf(f.path), group: f.group } })

// Groups files into the nodes of one zoom level and sums the edges between them. Files
// inside the zoomed scope split one level finer; files outside it stay one level coarser.
export const levelOf = (g: CodeGraph, zoom: Zoom, since: number, name: (a: Area | "shared") => string): MapLevel => {
  const inScope = (f: FileInfo): boolean =>
    zoom.kind === "root" ? true
    : zoom.kind === "area" ? f.area === zoom.area
    : zoom.kind === "group" ? f.group === zoom.group
    : dirOf(f.path) === zoom.dir && f.group === zoom.group
  const keyOf = (f: FileInfo, focus: boolean): Key => {
    switch (zoom.kind) {
      case "root":
        return areaKey(f, name)
      case "area":
        return !focus ? areaKey(f, name) : f.group === undefined ? dirKey(f) : groupKey(f.group)
      case "group":
        return focus || f.group === undefined ? dirKey(f) : groupKey(f.group)
      case "dir":
        return { key: `file:${f.path}`, label: focus ? baseName(f.path) : f.path, zoom: undefined }
    }
  }

  interface Acc {
    k: Key
    focus: boolean
    files: number
    changedSince: number
    newSince: number
    assignedOnly: number
    area: Area | "shared"
    groups: Set<string>
    path: string | undefined
    lastAt: number
    lastTask: string | undefined
    lastAgent: string | undefined
  }
  const nodes = new Map<string, Acc>()
  const nodeOf = new Map<string, string>()
  const add = (f: FileInfo, focus: boolean) => {
    const k = keyOf(f, focus)
    let n = nodes.get(k.key)
    if (n === undefined) {
      n = { k, focus, files: 0, changedSince: 0, newSince: 0, assignedOnly: 0, area: f.area, groups: new Set(), path: zoom.kind === "dir" ? f.path : undefined, lastAt: -1, lastTask: undefined, lastAgent: undefined }
      nodes.set(k.key, n)
    }
    n.files++
    if (f.changedAt !== undefined && f.changedAt >= since) n.changedSince++
    if (since > 0 && f.firstAt >= since) n.newSince++
    if (f.changedAt === undefined && f.assignedAt !== undefined) n.assignedOnly++
    if (f.group !== undefined) n.groups.add(f.group)
    if (f.changedAt !== undefined && f.changedAt > n.lastAt) {
      n.lastAt = f.changedAt
      n.lastTask = f.lastTask
      n.lastAgent = f.lastAgent
    }
    nodeOf.set(f.path, k.key)
  }
  const live = (f: FileInfo) => f.agents.size > 0 || f.assignedAt !== undefined || f.importers > 0
  let scopedFiles = 0
  for (const f of g.files.values()) {
    if (live(f) && inScope(f)) {
      add(f, true)
      scopedFiles++
    }
  }

  const edges = new Map<string, { key: string; from: string; to: string; count: number; newSince: number; latest: DepEdge }>()
  for (const e of g.edges.values()) {
    const fromIn = nodeOf.has(e.from) && nodes.get(nodeOf.get(e.from)!)!.focus
    const toIn = nodeOf.has(e.to) && nodes.get(nodeOf.get(e.to)!)!.focus
    if (!fromIn && !toIn) continue
    // Pull in the other end of an edge that leaves the scope, one level coarser.
    for (const [p, inside] of [[e.from, fromIn], [e.to, toIn]] as const) {
      if (!inside && !nodeOf.has(p)) {
        const f = g.files.get(p)
        if (f !== undefined) add(f, false)
      }
    }
    const a = nodeOf.get(e.from)
    const b = nodeOf.get(e.to)
    if (a === undefined || b === undefined || a === b) continue
    const key = `${a}>${b}`
    const isNew = since > 0 && e.firstAt >= since && e.added
    const cur = edges.get(key)
    if (cur === undefined) edges.set(key, { key, from: a, to: b, count: 1, newSince: isNew ? 1 : 0, latest: e })
    else {
      cur.count++
      if (isNew) cur.newSince++
      if (e.firstAt > cur.latest.firstAt) cur.latest = e
    }
  }

  return {
    nodes: [...nodes.values()].map((n): MapNode => ({
      key: n.k.key,
      label: n.k.label,
      focus: n.focus,
      zoom: n.k.zoom,
      files: n.files,
      changedSince: n.changedSince,
      newSince: n.newSince,
      assignedOnly: n.assignedOnly,
      area: n.area,
      groups: n.groups.size,
      path: n.path,
      lastTask: n.lastTask,
      lastAgent: n.lastAgent
    })),
    edges: [...edges.values()],
    files: scopedFiles
  }
}
