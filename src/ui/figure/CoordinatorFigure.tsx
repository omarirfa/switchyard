import { useEffect, useRef, useState } from "react"
import type { AgentStatus } from "../../domain/Events.ts"
import type { Outcome, Phase } from "../../domain/Fleet.ts"
import { camera, facing, fit, poly, project, type Pt, ringAt, rrect, seg, slab } from "./iso.ts"

// A Hairline-style isometric figure drawn from run state. The coordinator sits in the
// centre and each node sits on a ring around it. A node is one agent in a small run,
// or one workstream (group of agents) in a fleet, so the figure stays readable at any size.
//   - a node drops in when it first appears,
//   - plates stack with commit volume,
//   - the node lifts in proportion to how much of it is working or testing,
//   - its link flows toward the hub while work is in progress,
//   - a dot travels down the link when new commits arrive,
//   - an amber arc joins two nodes while they conflict,
//   - merged nodes dock against the hub; rejected nodes dim in place.

export interface FigureNode {
  readonly id: string
  readonly status: AgentStatus
  readonly outcome: Outcome | undefined
  readonly plates: number
  readonly lift: number
  readonly punches: number
  readonly commits: number
}

export interface FigureArc {
  readonly id: string
  readonly a: string
  readonly b: string
  readonly open: boolean
}

const W = 400
const H = 290
const R = 70
const DOCK = 44
const HS = 15
const HUB = 19
const HT = 8
const BASE = 4
const PLATE = 2.4
const GAP = 1.8
const MAX_PLATES = 8
const LIFT = 10
const E = 84
const PACKET_MS = 900
const PULSE_MS = 1100
const PULSE_GAP_MS = 700
const FLASH_MS = 1600

const C = camera(45, 0.5, 1.4)
fit(C, [[-E, -E, 0], [E, -E, 0], [E, E, 0], [-E, E, 0], [-E, -E, 46], [E, -E, 46], [-E, E, 46], [0, 0, 46]], W / 2, H / 2)
const P = project(C)
const front = facing(C)

interface Spring {
  x: number
  v: number
  t: number
}
const spring = (x: number): Spring => ({ x, v: 0, t: x })
const step = (s: Spring, dt: number, k: number, c: number, snap: boolean): boolean => {
  if (snap) {
    s.x = s.t
    s.v = 0
    return false
  }
  const n = Math.max(1, Math.ceil(dt * 240))
  const h = dt / n
  for (let i = 0; i < n; i++) {
    const a = -k * (s.x - s.t) - c * s.v
    s.v += a * h
    s.x += s.v * h
  }
  if (Math.abs(s.x - s.t) < 0.005 && Math.abs(s.v) < 0.05) {
    s.x = s.t
    s.v = 0
    return false
  }
  return true
}

interface Anim {
  appear: Spring
  lift: Spring
  radius: Spring
  angle: Spring
  height: Spring
  phase: number
  commits: number
}

interface Packet {
  readonly id: string
  readonly t0: number
}

const baseAngle = (i: number, n: number) => -Math.PI * 0.75 + (i * 2 * Math.PI) / Math.max(n, 1)
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3)
const isLive = (n: FigureNode) => n.lift > 0.02 && n.outcome === undefined

const ellipse = (r: number, z: number) => {
  const pts: Array<Pt> = []
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2
    pts.push(P(Math.cos(a) * r, Math.sin(a) * r, z))
  }
  return poly(pts)
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

export const CoordinatorFigure = ({ nodes, arcs, phase, pulseKey, label }: {
  readonly nodes: ReadonlyArray<FigureNode>
  readonly arcs: ReadonlyArray<FigureArc>
  readonly phase: Phase
  readonly pulseKey: number
  readonly label: string
}) => {
  const anims = useRef(new Map<string, Anim>())
  const packets = useRef<Array<Packet>>([])
  const pulses = useRef<Array<number>>([])
  const flashes = useRef(new Map<string, number>())
  const lastPulseKey = useRef(pulseKey)
  const latest = useRef({ nodes, arcs })
  const [, setFrame] = useState(0)
  const [wake, setWake] = useState(0)
  const snap = reducedMotion()

  latest.current = { nodes, arcs }

  useEffect(() => {
    const now = performance.now()
    if (pulseKey < lastPulseKey.current) {
      anims.current.clear()
      packets.current = []
      pulses.current = []
      flashes.current.clear()
    }
    const lastPulse = pulses.current[pulses.current.length - 1] ?? -Infinity
    if (pulseKey > lastPulseKey.current && now - lastPulse > PULSE_GAP_MS && !snap) pulses.current.push(now)
    lastPulseKey.current = pulseKey

    const ids = new Set(nodes.map((n) => n.id))
    for (const id of anims.current.keys()) if (!ids.has(id)) anims.current.delete(id)
    nodes.forEach((node, i) => {
      let a = anims.current.get(node.id)
      if (a === undefined) {
        a = {
          appear: spring(0),
          lift: spring(0),
          radius: spring(R),
          angle: spring(baseAngle(i, nodes.length)),
          height: spring(0),
          phase: i * 1.7,
          commits: node.commits
        }
        anims.current.set(node.id, a)
      }
      if (node.commits > a.commits && !snap && packets.current.length < 24) packets.current.push({ id: node.id, t0: now })
      a.commits = node.commits
    })
    for (const arc of arcs) if (!arc.open && !flashes.current.has(arc.id)) flashes.current.set(arc.id, now)
    setWake((w) => w + 1)
  }, [nodes, arcs, pulseKey, snap])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      const { nodes: ns, arcs: as } = latest.current
      let moving = false
      ns.forEach((node, i) => {
        const a = anims.current.get(node.id)
        if (a === undefined) return
        a.appear.t = 1
        a.angle.t = baseAngle(i, ns.length)
        a.radius.t = node.outcome === "merged" ? DOCK : R
        a.height.t = Math.min(node.plates, MAX_PLATES)
        a.lift.t = node.outcome !== undefined ? 0 : node.status === "blocked" ? Math.max(0.3, node.lift) * LIFT : node.lift * LIFT
        if (step(a.appear, dt, 90, 14, snap)) moving = true
        if (step(a.angle, dt, 60, 14, snap)) moving = true
        if (step(a.radius, dt, 70, 15, snap)) moving = true
        if (step(a.height, dt, 140, 16, snap)) moving = true
        if (step(a.lift, dt, 80, 12, snap)) moving = true
        if (!snap && isLive(node)) moving = true
      })
      packets.current = packets.current.filter((p) => now - p.t0 < PACKET_MS)
      pulses.current = pulses.current.filter((t0) => now - t0 < PULSE_MS)
      if (packets.current.length > 0 || pulses.current.length > 0) moving = true
      for (const t0 of flashes.current.values()) if (now - t0 < FLASH_MS) moving = true
      if (as.some((a) => a.open)) moving = true
      setFrame((f) => f + 1)
      if (moving) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [wake, snap])

  return (
    <Drawing
      nodes={nodes}
      arcs={arcs}
      phase={phase}
      anims={anims.current}
      packets={packets.current}
      pulses={pulses.current}
      flashes={flashes.current}
      snap={snap}
      label={label}
    />
  )
}

interface Placed {
  readonly node: FigureNode
  readonly x: number
  readonly y: number
  readonly z: number
  readonly anim: Anim
}

const Drawing = ({ nodes, arcs, phase, anims, packets, pulses, flashes, snap, label }: {
  readonly nodes: ReadonlyArray<FigureNode>
  readonly arcs: ReadonlyArray<FigureArc>
  readonly phase: Phase
  readonly anims: ReadonlyMap<string, Anim>
  readonly packets: ReadonlyArray<Packet>
  readonly pulses: ReadonlyArray<number>
  readonly flashes: ReadonlyMap<string, number>
  readonly snap: boolean
  readonly label: string
}) => {
  const now = performance.now()
  const t = now / 1000

  const placed: Array<Placed> = nodes.flatMap((node) => {
    const a = anims.get(node.id)
    if (a === undefined) return []
    const bob = isLive(node) && !snap ? Math.sin(t * 2.4 + a.phase) * 1.4 * Math.min(1, node.lift * 2) : 0
    const drop = (1 - a.appear.x) * 34
    return [{
      node,
      x: Math.cos(a.angle.x) * a.radius.x,
      y: Math.sin(a.angle.x) * a.radius.x,
      z: Math.max(0, a.lift.x) + bob + drop,
      anim: a
    }]
  })
  const byId = new Map(placed.map((p) => [p.node.id, p]))
  const topZ = (p: Placed) => p.z + BASE + Math.ceil(p.anim.height.x) * (PLATE + GAP)

  let grid = ""
  for (let v = -E; v <= E + 0.5; v += E / 4) grid += seg(P(v, -E, 0), P(v, E, 0)) + seg(P(-E, v, 0), P(E, v, 0))

  const hub = slab(P, front, rrect(-HUB, -HUB, HUB, HUB, 6), 0, HT)
  const hubMark = poly(ringAt(P, rrect(-7, -7, 7, 7, 2), HT))
  const hubInner = poly(ringAt(P, rrect(-HUB + 3.5, -HUB + 3.5, HUB - 3.5, HUB - 3.5, 4), HT))
  const anyLive = placed.some((p) => isLive(p.node))
  const hubTone = phase === "complete" ? "ok" : anyLive ? "live" : phase === "running" ? "edge" : "lo"

  const bodies = [
    { depth: 0, key: "hub", p: null as Placed | null },
    ...placed.map((p) => ({ depth: p.x + p.y, key: p.node.id, p }))
  ].sort((a, b) => a.depth - b.depth)

  const linkPath = (p: Placed, from: number, to: number) => {
    const d = Math.hypot(p.x, p.y) || 1
    return seg(P((p.x / d) * from, (p.y / d) * from, 0), P((p.x / d) * to, (p.y / d) * to, 0))
  }

  return (
    <svg className="cf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path className="nf lo" d={grid} />

      {placed.map((p) =>
        p.z > 0.6 && p.anim.appear.x > 0.95
          ? <path key={`slot-${p.node.id}`} className="nf lo" d={poly(ringAt(P, rrect(p.x - HS, p.y - HS, p.x + HS, p.y + HS, 4), 0))} />
          : null
      )}

      {placed.map((p) => {
        const dist = Math.hypot(p.x, p.y)
        const live = isLive(p.node)
        const tone = p.node.outcome === "merged" ? "ok" : p.node.outcome === "rejected" || p.node.status === "failed" ? "dim" : live ? "live" : "idle"
        return (
          <g key={`link-${p.node.id}`} className={`lk lk-${tone} st-${p.node.status}`} opacity={p.anim.appear.x}>
            <path className="nf lk-base" d={linkPath(p, HUB + 3, dist - HS - 2)} />
            {live && <path className="nf lk-flow" d={linkPath(p, dist - HS - 2, HUB + 3)} />}
          </g>
        )
      })}

      {pulses.map((t0) => {
        const k = ease((now - t0) / PULSE_MS)
        return <path key={`pulse-${t0}`} className="nf pulse" d={ellipse(HUB * 1.3 + k * HUB * 1.9, 0)} opacity={1 - k} />
      })}

      {packets.map((pk) => {
        const p = byId.get(pk.id)
        if (p === undefined) return null
        const k = ease((now - pk.t0) / PACKET_MS)
        const dist = Math.hypot(p.x, p.y) || 1
        const r = (dist - HS) * (1 - k) + (HUB + 2) * k
        const at = P((p.x / dist) * r, (p.y / dist) * r, 1.5)
        return <circle key={`pk-${pk.id}-${pk.t0}`} className="packet" cx={at[0]} cy={at[1]} r={2.6} />
      })}

      {bodies.map((b) => {
        if (b.p === null) {
          return (
            <g key="hub" className={`hub hub-${hubTone}`}>
              <path className="sil" d={hub.sil} />
              <path className="crease" d={hub.crease} />
              <path className="nf lo" d={hubInner} />
              <path className="mark" d={hubMark} />
            </g>
          )
        }
        const p = b.p
        const ring = rrect(p.x - HS, p.y - HS, p.x + HS, p.y + HS, 4)
        const plates = p.anim.height.x
        const whole = Math.floor(plates)
        const frac = plates - whole
        const layers: Array<{ z0: number; z1: number }> = [{ z0: p.z, z1: p.z + BASE }]
        for (let i = 0; i < whole; i++) {
          const z0 = p.z + BASE + GAP + i * (PLATE + GAP)
          layers.push({ z0, z1: z0 + PLATE })
        }
        if (frac > 0.04) {
          const z0 = p.z + BASE + GAP + whole * (PLATE + GAP)
          layers.push({ z0, z1: z0 + PLATE * frac })
        }
        const top = layers[layers.length - 1]!.z1
        const punches = Array.from({ length: p.node.punches }, (_, i) => P(p.x + HS - 4.5 - i * 4, p.y + HS - 4.5, top))
        const cls = `ft st-${p.node.status}${p.node.outcome ? ` oc-${p.node.outcome}` : ""}`
        return (
          <g key={p.node.id} className={cls} opacity={Math.min(1, p.anim.appear.x * 1.4)}>
            {layers.map((l, i) => {
              const s = slab(P, front, ring, l.z0, l.z1)
              return (
                <g key={i}>
                  <path className="sil" d={s.sil} />
                  <path className="crease" d={s.crease} />
                </g>
              )
            })}
            {punches.map((q, i) => <circle key={i} className="punch" cx={q[0]} cy={q[1]} r={1.3} />)}
          </g>
        )
      })}

      {arcs.map((arc) => {
        const pa = byId.get(arc.a)
        const pb = byId.get(arc.b)
        if (pa === undefined || pb === undefined) return null
        const resolvedAt = flashes.get(arc.id)
        const fade = resolvedAt === undefined ? 1 : 1 - Math.min((now - resolvedAt) / FLASH_MS, 1)
        if (!arc.open && fade <= 0) return null
        const za = topZ(pa) + 2
        const zb = topZ(pb) + 2
        const A = P(pa.x, pa.y, za)
        const B = P(pb.x, pb.y, zb)
        const M = P((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, Math.max(za, zb) + 34)
        return (
          <path
            key={arc.id}
            className={arc.open ? "nf arc arc-open" : "nf arc arc-done"}
            d={`M${A[0]} ${A[1]}Q${M[0]} ${M[1]} ${B[0]} ${B[1]}`}
            opacity={arc.open ? 1 : fade}
          />
        )
      })}
    </svg>
  )
}
