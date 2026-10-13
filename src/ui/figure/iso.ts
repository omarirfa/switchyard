// Isometric helpers ported from Hairline (https://github.com/lucasmarkes/hairline,
// MIT, Copyright (c) Lucas Marques). Hairline keeps its engine internal, so the
// coordinator figure reuses these few functions to match its projection and outlines.

export type Pt = readonly [number, number]
export interface RingPt {
  readonly u: number
  readonly v: number
  readonly nu: number
  readonly nv: number
}
export interface Camera {
  readonly az: number
  readonly k: number
  readonly S: number
  ox: number
  oy: number
}
export type Project = (x: number, y: number, z: number) => Pt

const rad = (d: number) => (d * Math.PI) / 180
const r2 = (n: number) => Math.round(n * 100) / 100

export const camera = (azDeg: number, k: number, S: number): Camera => ({ az: rad(azDeg), k, S, ox: 0, oy: 0 })

export const project = (C: Camera): Project => {
  const c = Math.cos(C.az)
  const s = Math.sin(C.az)
  const zf = Math.sqrt(1 - C.k * C.k)
  return (x, y, z) => {
    const X = x * c - y * s
    const Y = x * s + y * c
    return [C.ox + C.S * X, C.oy + C.S * (Y * C.k - z * zf)]
  }
}

// Centres the projected bounding box of `pts` on (cx, cy).
export const fit = (C: Camera, pts: ReadonlyArray<readonly [number, number, number]>, cx: number, cy: number) => {
  C.ox = 0
  C.oy = 0
  const P = project(C)
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
  for (const p of pts) {
    const q = P(p[0], p[1], p[2])
    a = Math.min(a, q[0])
    b = Math.max(b, q[0])
    c = Math.min(c, q[1])
    d = Math.max(d, q[1])
  }
  C.ox = cx - (a + b) / 2
  C.oy = cy - (c + d) / 2
}

export const poly = (pts: ReadonlyArray<Pt>) => "M" + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join("L") + "Z"
export const open = (pts: ReadonlyArray<Pt>) => pts.length < 2 ? "" : "M" + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join("L")
export const seg = (a: Pt, b: Pt) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`

export const rrect = (u0: number, v0: number, u1: number, v1: number, r: number, n = 6): Array<RingPt> => {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2))
  const out: Array<RingPt> = []
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [u1 - r, v1 - r, 0],
    [u0 + r, v1 - r, 90],
    [u0 + r, v0 + r, 180],
    [u1 - r, v0 + r, 270]
  ]
  for (const [cu, cv, a0] of corners) {
    for (let k = 0; k <= n; k++) {
      const a = rad(a0 + (90 * k) / n)
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa })
    }
  }
  return out
}

export const hull = (input: ReadonlyArray<Pt>): Array<Pt> => {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const x = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Array<Pt> = []
  const up: Array<Pt> = []
  for (const p of pts) {
    while (lo.length > 1 && x(lo[lo.length - 2]!, lo[lo.length - 1]!, p) <= 0) lo.pop()
    lo.push(p)
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!
    while (up.length > 1 && x(up[up.length - 2]!, up[up.length - 1]!, p) <= 0) up.pop()
    up.push(p)
  }
  lo.pop()
  up.pop()
  return lo.concat(up)
}

export const ringAt = (P: Project, ring: ReadonlyArray<RingPt>, z: number) => ring.map((q) => P(q.u, q.v, z))

export const facing = (C: Camera) => {
  const s = Math.sin(C.az)
  const c = Math.cos(C.az)
  return (q: RingPt) => q.nu * s + q.nv * c >= -1e-6
}

// The longest contiguous run of ring points that face the camera.
export const run = (ring: ReadonlyArray<RingPt>, keep: (q: RingPt) => boolean): Array<RingPt> => {
  const n = ring.length
  let s = -1
  for (let i = 0; i < n; i++) {
    if (keep(ring[i]!) && !keep(ring[(i + n - 1) % n]!)) {
      s = i
      break
    }
  }
  if (s < 0) return keep(ring[0]!) ? ring.slice() : []
  const out: Array<RingPt> = []
  for (let k = 0; k < n && keep(ring[(s + k) % n]!); k++) out.push(ring[(s + k) % n]!)
  return out
}

// A rounded slab: a filled silhouette (bright) and the front edge of its top face (dim).
export const slab = (
  P: Project,
  front: (q: RingPt) => boolean,
  ring: ReadonlyArray<RingPt>,
  z0: number,
  z1: number
) => ({
  sil: poly(hull(ringAt(P, ring, z1).concat(ringAt(P, ring, z0)))),
  top: poly(ringAt(P, ring, z1)),
  crease: open(ringAt(P, run(ring, front), z1))
})
