import { useEffect, useMemo, useRef, useState } from "react"
import { type Area, AREAS, areaLabel, areaOf } from "../../domain/Areas.ts"
import type { FleetView } from "../../domain/Fleet.ts"
import { full } from "../format.ts"
import { camera, facing, fit, poly, project, ringAt, rrect, seg, slab } from "./iso.ts"

// Merge queue drawn in the coordinator figure's line language. Each rail is one merge
// queue: one per product area in a fleet, one per agent in a small run. Tiles waiting
// on a rail are tasks ready to merge. When the coordinator decides, a tile rides its
// rail into main and main grows a plate; a rejected tile slips off the rail and fades.

const W = 400
const H = 270
const M = { x: -58, y: 52 }
const RAIL = 128
const TS = 7
const MAIN = 15
const PLATE = 2.6
const GAP = 1.4
const MAX_PLATES = 10
const FLY_MS = 1100
const FLASH_MS = 900

const laneAngle = (i: number, n: number) => {
  const from = -Math.PI * 0.62
  const to = Math.PI * 0.02
  return n <= 1 ? (from + to) / 2 : from + ((to - from) * i) / (n - 1)
}

// Fit the camera to what is drawn: rail ends, the main stack at full height, and a tile margin.
const ends: Array<readonly [number, number, number]> = []
for (let k = 0; k <= 12; k++) {
  const a = laneAngle(k, 13)
  const r = RAIL + TS + 4
  ends.push([M.x + Math.cos(a) * r, M.y + Math.sin(a) * r, 0], [M.x + Math.cos(a) * r, M.y + Math.sin(a) * r, 4])
}
const C0 = camera(45, 0.5, 1)
const box: Array<readonly [number, number, number]> = [...ends, [M.x - MAIN - 4, M.y - MAIN - 4, 0], [M.x + MAIN + 4, M.y + MAIN + 4, 0], [M.x - MAIN, M.y + MAIN, 5 + MAX_PLATES * (PLATE + GAP) + 4], [M.x + MAIN, M.y - MAIN, 5 + MAX_PLATES * (PLATE + GAP) + 4]]
const P1 = project(C0)
const xs = box.map((p) => P1(p[0], p[1], p[2]))
const bw = Math.max(...xs.map((q) => q[0])) - Math.min(...xs.map((q) => q[0]))
const bh = Math.max(...xs.map((q) => q[1])) - Math.min(...xs.map((q) => q[1]))
const C = camera(45, 0.5, Math.min((W - 16) / bw, (H - 16) / bh))
fit(C, box, W / 2, H / 2)
const GX0 = Math.floor(Math.min(...ends.map((e) => e[0])) / 25) * 25
const GX1 = Math.ceil(Math.max(...ends.map((e) => e[0]), M.x + MAIN) / 25) * 25
const GY0 = Math.floor(Math.min(...ends.map((e) => e[1])) / 25) * 25
const GY1 = Math.ceil(Math.max(...ends.map((e) => e[1]), M.y + MAIN) / 25) * 25
const P = project(C)
const front = facing(C)

export interface Lane {
  readonly id: string
  readonly label: string
  readonly kind: "agent" | "area"
  readonly waiting: number
  readonly merged: number
  readonly rejected: number
}

interface Flight {
  readonly lane: number
  readonly merged: boolean
  readonly t0: number
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3)
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export const mergeLanes = (view: FleetView): ReadonlyArray<Lane> => {
  const store = view.store
  if (view.agents <= 8) {
    return store.order.flatMap((id): Array<Lane> => {
      const rec = store.agents.get(id)
      if (rec === undefined) return []
      const finished = rec.status === "done" || rec.status === "failed"
      return [{
        id,
        label: `Agent ${id}`,
        kind: "agent",
        waiting: finished && rec.outcome === undefined ? 1 : 0,
        merged: rec.outcome === "merged" ? 1 : 0,
        rejected: rec.outcome === "rejected" ? 1 : 0
      }]
    })
  }
  const waiting = new Map<Area, number>()
  for (const t of store.tasks.values()) {
    if (t.decision !== undefined || t.agents.length === 0) continue
    const finished = t.agents.every((id) => {
      const s = store.agents.get(id)?.status
      return s === "done" || s === "failed"
    })
    if (finished) waiting.set(areaOf(t.group), (waiting.get(areaOf(t.group)) ?? 0) + 1)
  }
  const merged = new Map<Area, number>()
  const rejected = new Map<Area, number>()
  for (const d of store.decisions) {
    const a = areaOf(store.tasks.get(d.taskId)?.group ?? "")
    merged.set(a, (merged.get(a) ?? 0) + d.merged.length)
    rejected.set(a, (rejected.get(a) ?? 0) + d.rejected.length)
  }
  return AREAS.map((a) => ({
    id: a,
    label: areaLabel[a],
    kind: "area",
    waiting: waiting.get(a) ?? 0,
    merged: merged.get(a) ?? 0,
    rejected: rejected.get(a) ?? 0
  }))
}

export const MergeFlow = ({ view, onLane, onMain }: { readonly view: FleetView; readonly onLane: (lane: Lane) => void; readonly onMain: () => void }) => {
  const lanes = useMemo(() => mergeLanes(view), [view])
  const totalMerged = view.merged
  const flights = useRef<Array<Flight>>([])
  const flash = useRef(-Infinity)
  const seen = useRef(0)
  const height = useRef({ x: 0, t: 0 })
  const [, setFrame] = useState(0)
  const [wake, setWake] = useState(0)
  const snap = reduced()

  useEffect(() => {
    const store = view.store
    const n = store.decisions.length
    const now = performance.now()
    if (n < seen.current) {
      flights.current = []
      seen.current = 0
    }
    if (n > seen.current && !snap) {
      const fresh = store.decisions.slice(seen.current)
      const used = new Set<string>()
      for (const d of fresh) {
        const area = areaOf(store.tasks.get(d.taskId)?.group ?? "")
        const targets = lanes[0]?.kind === "agent"
          ? [...d.merged.map((id) => ({ id, merged: true })), ...d.rejected.map((id) => ({ id, merged: false }))]
          : [
            ...(d.merged.length > 0 ? [{ id: area as string, merged: true }] : []),
            ...(d.rejected.length > 0 ? [{ id: area as string, merged: false }] : [])
          ]
        for (const tg of targets) {
          const key = `${tg.id}|${tg.merged}`
          if (used.has(key) || flights.current.length > 16) continue
          used.add(key)
          const lane = lanes.findIndex((l) => l.id === tg.id)
          if (lane >= 0) flights.current.push({ lane, merged: tg.merged, t0: now + used.size * 90 })
        }
      }
    }
    seen.current = n
    height.current.t = Math.min(MAX_PLATES, totalMerged <= 0 ? 0 : Math.ceil(Math.log2(1 + totalMerged)))
    if (snap) height.current.x = height.current.t
    setWake((w) => w + 1)
  }, [view, lanes, totalMerged, snap])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const h = height.current
      h.x += (h.t - h.x) * Math.min(1, dt * 6)
      if (Math.abs(h.t - h.x) < 0.01) h.x = h.t
      for (const f of flights.current) {
        if (f.merged && now - f.t0 >= FLY_MS && now - f.t0 < FLY_MS + 40) flash.current = now
      }
      flights.current = flights.current.filter((f) => now - f.t0 < FLY_MS + 400)
      setFrame((x) => x + 1)
      if (flights.current.length > 0 || h.x !== h.t || now - flash.current < FLASH_MS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [wake])

  const now = performance.now()
  const n = lanes.length
  const starts = lanes.map((_, i) => {
    const a = laneAngle(i, n)
    return { x: M.x + Math.cos(a) * RAIL, y: M.y + Math.sin(a) * RAIL, a }
  })
  const along = (i: number, u: number) => {
    const s = starts[i]!
    const end = { x: M.x + Math.cos(s.a) * (MAIN + 6), y: M.y + Math.sin(s.a) * (MAIN + 6) }
    return { x: s.x + (end.x - s.x) * u, y: s.y + (end.y - s.y) * u }
  }
  const tile = (x: number, y: number, z: number) => slab(P, front, rrect(x - TS, y - TS, x + TS, y + TS, 2.5), z, z + 3)

  let grid = ""
  for (let x = GX0; x <= GX1; x += 25) grid += seg(P(x, GY0, 0), P(x, GY1, 0))
  for (let y = GY0; y <= GY1; y += 25) grid += seg(P(GX0, y, 0), P(GX1, y, 0))

  const mainRing = rrect(M.x - MAIN, M.y - MAIN, M.x + MAIN, M.y + MAIN, 5)
  const plates = height.current.x
  const whole = Math.floor(plates)
  const layers: Array<readonly [number, number]> = [[0, 5]]
  for (let i = 0; i < whole; i++) layers.push([5 + GAP + i * (PLATE + GAP), 5 + GAP + i * (PLATE + GAP) + PLATE])
  if (plates - whole > 0.05) {
    const z0 = 5 + GAP + whole * (PLATE + GAP)
    layers.push([z0, z0 + PLATE * (plates - whole)])
  }
  const flashing = now - flash.current < FLASH_MS
  const busy = new Set(flights.current.filter((f) => now >= f.t0).map((f) => f.lane))

  const label = n === 0
    ? "Merge queue with no lanes yet"
    : `Merge queue into main. ${lanes.map((l) => `${l.label}: ${l.merged} merged, ${l.waiting} waiting`).join("; ")}.`

  return (
    <figure className="merge-figure">
      <svg className="cf mf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <path className="nf lo" d={grid} />
        {starts.map((s, i) => {
          const a = along(i, 0)
          const b = along(i, 1)
          const nx = -Math.sin(s.a) * 3.2
          const ny = Math.cos(s.a) * 3.2
          return (
            <g key={lanes[i]!.id} className={busy.has(i) ? "mrail mrail-busy" : lanes[i]!.waiting > 0 ? "mrail mrail-wait" : "mrail"}>
              <path className="nf" d={seg(P(a.x + nx, a.y + ny, 0), P(b.x + nx, b.y + ny, 0)) + seg(P(a.x - nx, a.y - ny, 0), P(b.x - nx, b.y - ny, 0))} />
              <path className="nf mrail-stop" d={seg(P(a.x + nx * 1.6, a.y + ny * 1.6, 0), P(a.x - nx * 1.6, a.y - ny * 1.6, 0))} />
            </g>
          )
        })}

        {lanes.flatMap((l, i) =>
          Array.from({ length: Math.min(3, l.waiting) }, (_, k) => {
            const p = along(i, 0.08 + k * 0.13)
            const t = tile(p.x, p.y, 0)
            return (
              <g key={`q-${l.id}-${k}`} className="qtile">
                <path className="sil" d={t.sil} />
                <path className="crease" d={t.crease} />
              </g>
            )
          })
        )}

        <g className={flashing ? "mstack mstack-flash" : "mstack"}>
          {layers.map(([z0, z1], i) => {
            const s = slab(P, front, mainRing, z0, z1)
            return (
              <g key={i}>
                <path className="sil" d={s.sil} />
                <path className="crease" d={s.crease} />
              </g>
            )
          })}
          <path className="nf mstack-mark" d={poly(ringAt(P, rrect(M.x - 5, M.y - 5, M.x + 5, M.y + 5, 1.5), layers[layers.length - 1]![1]))} />
        </g>

        {flights.current.map((f, k) => {
          const age = now - f.t0
          if (age < 0) return null
          const u = f.merged ? ease(age / FLY_MS) : ease(Math.min(1, age / (FLY_MS * 0.5))) * 0.45
          const p = along(f.lane, u)
          const fall = f.merged ? 0 : Math.max(0, (age - FLY_MS * 0.5) / (FLY_MS * 0.6))
          const s = starts[f.lane]!
          const side = f.merged ? 0 : fall * 10
          const x = p.x - Math.sin(s.a) * side
          const y = p.y + Math.cos(s.a) * side
          const t = tile(x, y, f.merged ? 1 : Math.max(-8, 1 - fall * 9))
          const opacity = f.merged ? (age > FLY_MS ? Math.max(0, 1 - (age - FLY_MS) / 300) : 1) : Math.max(0, 1 - fall)
          return (
            <g key={`f-${k}-${f.t0}`} className={f.merged ? "ftile ftile-ok" : "ftile ftile-rej"} opacity={opacity}>
              <path className="sil" d={t.sil} />
              <path className="crease" d={t.crease} />
            </g>
          )
        })}
      </svg>
      <figcaption>
        <ul className="cf-legend mf-legend" aria-label="Merge queues">
          <li className="mf-main">
            <button id="lane-main" type="button" className="chip-btn" onClick={onMain} disabled={view.store.decisions.every((d) => d.merged.length === 0)} title="Open the code from the latest merge">
              <span className="cf-key" aria-hidden="true" />
              <b>main</b>
              <span className="cf-detail">{full(totalMerged)} merged</span>
            </button>
          </li>
          {lanes.map((l) => (
            <li key={l.id} className={l.waiting > 0 ? "st-testing" : l.merged > 0 ? "st-merged" : "st-queued"}>
              <button id={`lane-${l.id}`} type="button" className="chip-btn" onClick={() => onLane(l)}>
                <span className="cf-key" aria-hidden="true" />
                <b>{l.kind === "agent" ? l.id : l.label}</b>
                <span className="cf-detail">{full(l.merged)} merged</span>
                {l.waiting > 0 && <span className="cf-detail">{full(l.waiting)} waiting</span>}
              </button>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
