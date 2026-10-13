import { ArrowCounterClockwise, Broadcast, UsersThree } from "@phosphor-icons/react"
import type { FleetView } from "../domain/Fleet.ts"
import { full } from "./format.ts"

const Mark = () => (
  <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 6h16" />
    <path d="M4 6c5 0 6 6 10 6h6" />
    <path d="M4 6c5 0 6 12 10 12h6" />
    <circle cx="4" cy="6" r="2" />
  </svg>
)

// The agent count comes from the run itself, so it climbs as the coordinator adds
// agents. No preset decides the scale.
export const TopBar = ({ view, onReplay }: { readonly view: FleetView; readonly onReplay: () => void }) => (
  <header className="topbar">
    <div className="brand">
      <Mark />
      <span className="brand-name">Switchyard</span>
      <span className="brand-sub">Agent desk</span>
    </div>

    <div className="topbar-actions">
      <span className="source" title="Every event comes from the sample scripts and the seeded simulator in src/data. The Worker feed replaces them once connected.">
        <Broadcast aria-hidden="true" />
        Sample data
      </span>
      <span id="agent-count" className="agent-count" title="Agents the coordinator has assigned in this run">
        <UsersThree aria-hidden="true" />
        <b>{full(view.agents)}</b>
        <span>{view.agents === 1 ? "agent" : "agents"}</span>
        <span className="agent-count-active">{full(view.active)} active</span>
      </span>
      <button id="replay" type="button" className="btn" onClick={onReplay}>
        <ArrowCounterClockwise aria-hidden="true" />
        Replay
      </button>
    </div>
  </header>
)
