import { useEffect, useRef, useState } from "react"
import type { FleetView, HistoryPoint } from "../domain/Fleet.ts"
import { niceDomain } from "../domain/Timeline.ts"
import { clock, compact, full } from "./format.ts"

// Stacked area of how many agents sit in each live state over time. At fleet scale this
// replaces one row per agent: the shape of the run reads the same at 30 agents or 30 million.
// Stack order (bottom to top) and colours were checked with the dataviz palette validator:
// blocked, working, testing. Blocked also carries a hatch so it never depends on colour alone.

const SERIES = [
  { key: "blocked", label: "Blocked" },
  { key: "working", label: "Working" },
  { key: "testing", label: "Testing" }
] as const
type Key = typeof SERIES[number]["key"]

// Taller on wide screens so the chart fills its row next to the merge queue figure.
const chartHeight = (width: number) => (width < 560 ? 220 : 350)
const PAD = { l: 44, r: 12, t: 10, b: 24 }

const niceMax = (v: number) => {
  if (v <= 4) return 4
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p
  return 10 * p
}

const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const ro = new ResizeObserver(([entry]) => entry && setW(Math.max(280, entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export const StatusChart = ({ view, now }: { readonly view: FleetView; readonly now: number }) => {
  const [ref, width] = useWidth()
  const H = chartHeight(width)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const points: Array<HistoryPoint> = [...view.history, { at: now, counts: view.counts, commits: view.commits, merged: view.merged }]
  const domain = niceDomain(now)
  const maxTotal = Math.max(...points.map((p) => p.counts.blocked + p.counts.working + p.counts.testing))
  const yMax = niceMax(maxTotal)
  const iw = width - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const x = (t: number) => PAD.l + (t / domain) * iw
  const y = (v: number) => PAD.t + ih - (v / yMax) * ih

  const stacks = points.map((p) => {
    let acc = 0
    const out = {} as Record<Key, readonly [number, number]>
    for (const s of SERIES) {
      const v = p.counts[s.key]
      out[s.key] = [acc, acc + v]
      acc += v
    }
    return out
  })

  const area = (key: Key) => {
    const top = points.map((p, i) => `${x(p.at).toFixed(1)} ${y(stacks[i]![key][1]).toFixed(1)}`)
    const bottom = points.map((p, i) => `${x(p.at).toFixed(1)} ${y(stacks[i]![key][0]).toFixed(1)}`).reverse()
    return `M${top.join("L")}L${bottom.join("L")}Z`
  }
  const line = (key: Key) => `M${points.map((p, i) => `${x(p.at).toFixed(1)} ${y(stacks[i]![key][1]).toFixed(1)}`).join("L")}`

  const yTicks = [0, yMax / 4, yMax / 2, (3 * yMax) / 4, yMax]
  const xStep = domain <= 10_000 ? 2_000 : domain <= 60_000 ? 10_000 : domain <= 300_000 ? 30_000 : 60_000
  const xTicks = Array.from({ length: Math.floor(domain / xStep) + 1 }, (_, i) => i * xStep)
  const latest = points[points.length - 1]!
  const hp = hover === null ? undefined : points[hover]

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - rect.left) / rect.width) * domain
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]!.at - t) < Math.abs(points[best]!.at - t)) best = i
    setHover(best)
  }

  return (
    <div className="chart" ref={ref}>
      <div className="chart-head">
        <ul className="legend" aria-label="Series">
          {SERIES.slice().reverse().map((s) => (
            <li key={s.key}>
              <span className={`swatch sw-${s.key}`} aria-hidden="true" />
              {s.label}
              <b>{full(latest.counts[s.key])}</b>
            </li>
          ))}
        </ul>
        <button id="chart-table" type="button" className="btn btn-quiet btn-small" aria-pressed={table} onClick={() => setTable((v) => !v)}>
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table
        ? (
          <div className="table-scroll">
            <table className="data-table">
              <caption className="sr-only">Agents in each live state over time</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  {SERIES.map((s) => <th key={s.key} scope="col">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 12)) === 0 || i === points.length - 1).map((p) => (
                  <tr key={p.at}>
                    <td>{clock(p.at)}</td>
                    {SERIES.map((s) => <td key={s.key}>{full(p.counts[s.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        : (
          <svg className="area-chart" width={width} height={H} role="img" aria-label={`Agents by live state over ${clock(now)}. Now ${latest.counts.working} working, ${latest.counts.testing} testing, ${latest.counts.blocked} blocked.`}>
            <defs>
              <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" className="hatch-bg" />
                <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" />
              </pattern>
            </defs>
            {yTicks.map((v) => (
              <g key={v}>
                <line className="grid-line" x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} />
                <text className="tick-text" x={PAD.l - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick-text" x={x(t)} y={H - 6} textAnchor="middle">{clock(t)}</text>
            ))}
            {SERIES.map((s) => (
              <g key={s.key} className={`series s-${s.key}`}>
                <path className="band" d={area(s.key)} />
                {s.key === "blocked" && <path className="band-hatch" d={area(s.key)} fill="url(#hatch)" />}
                <path className="edge" d={line(s.key)} />
              </g>
            ))}
            {hp !== undefined && (
              <g className="crosshair">
                <line x1={x(hp.at)} x2={x(hp.at)} y1={PAD.t} y2={PAD.t + ih} />
              </g>
            )}
            <rect
              className="hit"
              x={PAD.l}
              y={PAD.t}
              width={iw}
              height={ih}
              tabIndex={0}
              aria-label="Move across the chart to read values"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(points.length - 1)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length - 1) - 1))
                if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? 0) + 1))
              }}
            />
          </svg>
        )}

      {hp !== undefined && !table && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hp.at) + 12, 0), width - 170) }} role="status">
          <div className="tt-time">{clock(hp.at)}</div>
          {SERIES.slice().reverse().map((s) => (
            <div key={s.key} className="tt-row">
              <span className={`tt-key k-${s.key}`} aria-hidden="true" />
              <b>{full(hp.counts[s.key])}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
