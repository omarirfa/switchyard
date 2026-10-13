import { ArrowRight, MapTrifold } from "@phosphor-icons/react"
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useState } from "react"
import { codeSource } from "../data/codeSource.ts"
import { type Area, areaLabel, areaOf } from "../domain/Areas.ts"
import { graphFor, levelOf, type MapEdge, type MapLevel, type MapNode, type Zoom } from "../domain/CodeGraph.ts"
import type { FleetView } from "../domain/Fleet.ts"
import { agentName, clock, full, plural } from "./format.ts"

// Line-art map of the code the run touches. Nothing here is drawn by hand: nodes are the
// files contracts assign and commits change, grouped by zoom level, and links are the
// imports read from each changed file. Changes since the marker are drawn on top.

const NW = 176
const NH = 50
const COL_GAP = 84
const ROW_GAP = 14
const MAX_ROWS = 8
const PAD = 12

const areaName = (a: Area | "shared") => (a === "shared" ? "Shared code" : areaLabel[a])

interface Placed extends MapNode {
  readonly x: number
  readonly y: number
}

// Layered layout: each node sits one column right of the nodes that import it, so code
// reads left to right from callers to what they call. Tall columns wrap.
const layout = (level: MapLevel): { readonly nodes: ReadonlyArray<Placed>; readonly w: number; readonly h: number } => {
  const layer = new Map(level.nodes.map((n) => [n.key, 0]))
  for (let pass = 0; pass < level.nodes.length; pass++) {
    let moved = false
    for (const e of level.edges) {
      const a = layer.get(e.from) ?? 0
      if ((layer.get(e.to) ?? 0) < a + 1 && a + 1 < 6) {
        layer.set(e.to, a + 1)
        moved = true
      }
    }
    if (!moved) break
  }
  const byLayer = new Map<number, Array<MapNode>>()
  for (const n of level.nodes) {
    const l = layer.get(n.key) ?? 0
    byLayer.set(l, [...(byLayer.get(l) ?? []), n])
  }
  const placed: Array<Placed> = []
  let col = 0
  let maxRows = 0
  for (const l of [...byLayer.keys()].sort((a, b) => a - b)) {
    const list = byLayer.get(l)!.sort((a, b) =>
      Number(b.focus) - Number(a.focus) || b.changedSince - a.changedSince || a.label.localeCompare(b.label)
    )
    for (let i = 0; i < list.length; i += MAX_ROWS) {
      const chunk = list.slice(i, i + MAX_ROWS)
      chunk.forEach((n, r) => placed.push({ ...n, x: PAD + col * (NW + COL_GAP), y: PAD + r * (NH + ROW_GAP) }))
      maxRows = Math.max(maxRows, chunk.length)
      col++
    }
  }
  return { nodes: placed, w: PAD * 2 + col * NW + Math.max(0, col - 1) * COL_GAP, h: PAD * 2 + maxRows * NH + Math.max(0, maxRows - 1) * ROW_GAP }
}

const sameZoom = (a: Zoom, b: Zoom) => JSON.stringify(a) === JSON.stringify(b)

const crumbs = (z: Zoom): ReadonlyArray<{ readonly label: string; readonly zoom: Zoom }> => {
  const out: Array<{ label: string; zoom: Zoom }> = [{ label: "All areas", zoom: { kind: "root" } }]
  const area = z.kind === "area" ? z.area : z.kind === "group" ? areaOf(z.group) : z.kind === "dir" ? (z.group === undefined ? "shared" : areaOf(z.group)) : undefined
  if (area !== undefined) out.push({ label: areaName(area), zoom: { kind: "area", area } })
  if (z.kind === "group") out.push({ label: z.group, zoom: z })
  if (z.kind === "dir") {
    if (z.group !== undefined) out.push({ label: z.group, zoom: { kind: "group", group: z.group } })
    out.push({ label: z.dir || "/", zoom: z })
  }
  return out
}

const onKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault()
    fn()
  }
}

const clip = (s: string) => (s.length > 22 ? `${s.slice(0, 10)}...${s.slice(-10)}` : s)

export const MapPanel = ({ view, since, onArea, onGroup, onOpenAgent, onReview }: {
  readonly view: FleetView
  readonly since: number
  readonly onArea: (a: Area) => void
  readonly onGroup: (group: string) => void
  readonly onOpenAgent: (id: string) => void
  readonly onReview: (taskId: string) => void
}) => {
  const [zoom, setZoom] = useState<Zoom>({ kind: "root" })
  const graph = graphFor(view.store, codeSource)
  const version = graph.version
  const level = useMemo(() => levelOf(graph, zoom, since, areaName), [graph, version, zoom, since])
  const placed = useMemo(() => layout(level), [level])
  const pos = new Map(placed.nodes.map((n) => [n.key, n]))

  // A rewind can remove the folder or workstream on screen; fall back to the top.
  useEffect(() => {
    if (zoom.kind !== "root" && level.files === 0) setZoom({ kind: "root" })
  }, [zoom, level.files])

  // Open whatever explains a change: the merge if the coordinator merged it, else the agent.
  const openChange = (taskId: string | undefined, agentId: string | undefined) => {
    const d = taskId === undefined ? undefined : view.store.tasks.get(taskId)?.decision
    if (taskId !== undefined && d !== undefined && d.merged.length > 0) onReview(taskId)
    else if (agentId !== undefined) onOpenAgent(agentId)
  }
  const openNode = (n: MapNode) => {
    if (n.zoom !== undefined && !sameZoom(n.zoom, zoom)) setZoom(n.zoom)
    else openChange(n.lastTask, n.lastAgent)
  }
  const openEdge = (e: MapEdge) => openChange(e.latest.taskId, e.latest.agentId)

  const focus = level.nodes.filter((n) => n.focus)
  const changed = focus.reduce((s, n) => s + n.changedSince, 0)
  const added = focus.reduce((s, n) => s + n.newSince, 0)
  const assigned = focus.reduce((s, n) => s + n.assignedOnly, 0)
  const newLinks = level.edges.reduce((s, e) => s + e.newSince, 0)
  const marker = since === 0 ? "the run started" : clock(since)
  const trail = crumbs(zoom)
  const waiting = (n: MapNode): number => {
    if (n.key.startsWith("area:") && n.area !== "shared") return view.owners.find((o) => o.area === n.area)?.open ?? 0
    if (n.key.startsWith("group:")) return view.groups.find((g) => `group:${g.name}` === n.key)?.openConflicts ?? 0
    return 0
  }

  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <header className="panel-head">
        <h2 id="map-title"><MapTrifold aria-hidden="true" /> System map</h2>
        <span className="count-text">Built from {plural(graph.files.size, "file")} and {plural(graph.edges.size, "import")} in this run</span>
      </header>

      <nav className="map-trail" aria-label="Map level">
        <ol>
          {trail.map((c, i) => (
            <li key={c.label}>
              {i === trail.length - 1
                ? <span aria-current="page">{c.label}</span>
                : <button id={`map-crumb-${i}`} type="button" className="link-btn" onClick={() => setZoom(c.zoom)}>{c.label}</button>}
            </li>
          ))}
        </ol>
        {zoom.kind === "area" && zoom.area !== "shared" && (
          <button id="map-open-area" type="button" className="btn btn-small" onClick={() => onArea(zoom.area as Area)}>
            {areaName(zoom.area)} panel <ArrowRight aria-hidden="true" />
          </button>
        )}
        {zoom.kind === "group" && (
          <button id="map-open-group" type="button" className="btn btn-small" onClick={() => onGroup(zoom.group)}>
            {zoom.group} panel <ArrowRight aria-hidden="true" />
          </button>
        )}
      </nav>

      <p className="map-sum">
        Since {marker}: <b>{plural(changed, "file")} changed</b>
        {since > 0 && <>, <b>{plural(added, "new file")}</b>, <b>{plural(newLinks, "new import")}</b></>}
        {assigned > 0 && <>, {plural(assigned, "file")} assigned and not changed yet</>}.
      </p>

      {level.nodes.length === 0
        ? <p className="quiet">No contract has assigned files yet. The map grows as agents receive and change files.</p>
        : (
          <div className="map-scroll">
            <svg className="cmap" width={placed.w} height={placed.h} viewBox={`0 0 ${placed.w} ${placed.h}`} role="group" aria-label={`System map, ${trail[trail.length - 1]!.label}`}>
              <defs>
                <marker id="cmap-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M1 1L7 4L1 7" className="cmap-arrowhead" />
                </marker>
              </defs>
              {level.edges.map((e) => {
                const a = pos.get(e.from)
                const b = pos.get(e.to)
                if (a === undefined || b === undefined) return null
                const forward = b.x > a.x
                const x1 = forward ? a.x + NW : a.x + NW / 2
                const y1 = forward ? a.y + NH / 2 : a.y + NH
                const x2 = forward ? b.x : b.x + NW / 2
                const y2 = forward ? b.y + NH / 2 : b.y
                const mx = (x1 + x2) / 2
                const d = forward ? `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` : `M${x1} ${y1}C${x1} ${y1 + 30} ${x2} ${y2 - 30} ${x2} ${y2}`
                const width = Math.min(3.2, 1 + Math.log10(e.count))
                const label = `${e.count === 1 ? "Import" : `${full(e.count)} imports`} from ${a.label} to ${b.label}${e.newSince > 0 ? `, ${e.newSince} new since ${marker}` : ""}. Latest by ${agentName(e.latest.agentId)}. Open the change.`
                return (
                  <g key={e.key} className={e.newSince > 0 ? "cmap-edge cmap-edge-new" : "cmap-edge"}>
                    <path className="cmap-line" d={d} style={{ strokeWidth: width }} markerEnd="url(#cmap-arrow)" />
                    <path className="cmap-hit" d={d} role="button" tabIndex={0} aria-label={label} onClick={() => openEdge(e)} onKeyDown={onKey(() => openEdge(e))}>
                      <title>{label}</title>
                    </path>
                  </g>
                )
              })}
              {placed.nodes.map((n) => {
                const w = waiting(n)
                const cls = [
                  "cmap-node",
                  n.focus ? "" : "cmap-dep",
                  n.changedSince > 0 ? "cmap-changed" : "",
                  n.files > 0 && n.assignedOnly === n.files ? "cmap-assigned" : "",
                  n.newSince > 0 ? "cmap-new" : ""
                ].filter(Boolean).join(" ")
                const heat = n.files === 0 ? 0 : Math.min(1, n.changedSince / n.files)
                const isFile = n.path !== undefined
                const sub = isFile
                  ? (!n.focus ? "Outside this folder" : n.newSince > 0 ? "New file" : n.changedSince > 0 ? "Changed" : n.assignedOnly > 0 ? "Assigned only" : "On main")
                  : n.focus ? plural(n.files, "file") : `${plural(n.files, "file")} used`
                const label = `${n.label}. ${sub}. ${n.changedSince} changed since ${marker}.${n.zoom !== undefined && !sameZoom(n.zoom, zoom) ? " Open this level." : " Open the latest change."}`
                return (
                  <g
                    key={n.key}
                    className={cls}
                    transform={`translate(${n.x} ${n.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    onClick={() => openNode(n)}
                    onKeyDown={onKey(() => openNode(n))}
                    style={{ "--heat": heat.toFixed(2) } as CSSProperties}
                  >
                    <title>{n.label}</title>
                    <rect className="cmap-box" width={NW} height={NH} rx={8} />
                    <text x={12} y={21} className="cmap-label">{clip(n.label)}</text>
                    <text x={12} y={38} className="cmap-sub">{sub}</text>
                    {n.changedSince > 0 && <text x={NW - 10} y={21} textAnchor="end" className="cmap-count">+{full(n.changedSince)}</text>}
                    {n.newSince > 0 && !isFile && <text x={NW - 10} y={38} textAnchor="end" className="cmap-newtag">{full(n.newSince)} new</text>}
                    {w > 0 && <circle cx={NW - 2} cy={2} r={6} className="cmap-wait" />}
                  </g>
                )
              })}
            </svg>
          </div>
        )}

      <ul className="legend map-legend">
        <li><span className="swatch sw-changed" aria-hidden="true" />Changed since the marker, brighter means a larger share</li>
        <li><span className="swatch sw-newline" aria-hidden="true" />Import added since the marker</li>
        <li><span className="swatch sw-assigned" aria-hidden="true" />Assigned by a contract, not changed yet</li>
        <li><span className="swatch sw-waiting" aria-hidden="true" />Questions or conflicts waiting</li>
      </ul>
    </section>
  )
}
