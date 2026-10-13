import { useMemo } from "react"
import type { FleetView } from "../domain/Fleet.ts"
import { CoordinatorFigure } from "./figure/CoordinatorFigure.tsx"
import { figureModel } from "./figure/nodes.ts"
import { kindLabel, phaseLabel, runSummary } from "./format.ts"
import { Kpis } from "./Kpis.tsx"

// Each legend chip opens what it names: an agent's drawer, a workstream panel, or the
// list of the remaining workstreams.
export const Hero = ({ view, now, onChip }: {
  readonly view: FleetView
  readonly now: number
  readonly onChip: (kind: "agent" | "group" | "more", id: string) => void
}) => {
  const model = useMemo(() => figureModel(view), [view])

  return (
    <section className="hero" aria-labelledby="run-title">
      <div className="hero-copy">
        <div className="eyebrow">
          <span className={`phase phase-${view.phase}`}>{phaseLabel[view.phase]}</span>
          {view.kind && <span className="eyebrow-text">{kindLabel[view.kind]}</span>}
          {view.runId && <code className="run-id">{view.runId}</code>}
        </div>
        <h1 id="run-title">{view.title ?? "Waiting for a run"}</h1>
        <p className="lede">{runSummary(view.kind, view.agents, view.tasks, view.groups.length)}</p>
        <Kpis view={view} now={now} />
      </div>

      <figure className="hero-figure">
        <CoordinatorFigure nodes={model.nodes} arcs={model.arcs} phase={view.phase} pulseKey={view.version} label={model.label} />
        <figcaption>
          <ul className="cf-legend" aria-label={model.mode === "agents" ? "Agents" : "Largest workstreams"}>
            {model.legend.length === 0 && <li className="quiet">Waiting for agents</li>}
            {model.legend.map((l) => (
              <li key={l.id} className={`st-${l.state}`}>
                <button
                  id={`chip-${l.id}`}
                  type="button"
                  className="chip-btn"
                  onClick={() => onChip(model.mode === "agents" ? "agent" : l.id === "other" ? "more" : "group", l.id)}
                >
                  <span className="cf-key" aria-hidden="true" />
                  <b>{l.name}</b>
                  <span>{l.stateText}</span>
                  <span className="cf-detail">{l.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
    </section>
  )
}
