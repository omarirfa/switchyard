import { ChatCircleDots, FileText, Files, GitMerge, Hourglass, Prohibit, Warning, XCircle } from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"
import type { AttentionKind, FleetView } from "../domain/Fleet.ts"
import { compact, full } from "./format.ts"

// One slot per kind, always in the same place, ordered by how soon a person should act:
// broken work first, then questions only a person can answer, then stuck agents, then
// queues. A slot with nothing in it stays in place and dims, so nothing shifts.
const SLOTS: ReadonlyArray<{ readonly kind: AttentionKind; readonly icon: Icon; readonly label: string; readonly tone: "bad" | "warn" | "info" }> = [
  { kind: "failed", icon: XCircle, label: "Failing tests", tone: "bad" },
  { kind: "conflicts", icon: Warning, label: "Open conflicts", tone: "warn" },
  { kind: "decisions", icon: ChatCircleDots, label: "Questions for owners", tone: "warn" },
  { kind: "contracts", icon: FileText, label: "Contracts to approve", tone: "warn" },
  { kind: "blocked", icon: Prohibit, label: "Blocked agents", tone: "info" },
  { kind: "stalled", icon: Hourglass, label: "Stalled agents", tone: "info" },
  { kind: "ready", icon: GitMerge, label: "Ready to merge", tone: "info" },
  { kind: "overlap", icon: Files, label: "Files in 3+ branches", tone: "info" }
]

export const Attention = ({ view, stallSeconds, onSelect }: {
  readonly view: FleetView
  readonly stallSeconds: number
  readonly onSelect: (kind: AttentionKind) => void
}) => {
  const counts = new Map(view.attention.map((a) => [a.kind, a.count]))
  const total = SLOTS.reduce((s, x) => s + (counts.get(x.kind) ?? 0), 0)
  return (
    <section className="attention-strip" aria-labelledby="attention-title">
      <h2 id="attention-title" className="sr-only">Needs attention</h2>
      <ul className="attention-list" aria-describedby="attention-total">
        {SLOTS.map((m) => {
          const n = counts.get(m.kind) ?? 0
          const I = m.icon
          return (
            <li key={m.kind}>
              <button
                id={`attention-${m.kind}`}
                type="button"
                className={n === 0 ? "att att-zero" : `att att-${m.tone}`}
                disabled={n === 0}
                onClick={() => onSelect(m.kind)}
                title={m.kind === "stalled" ? `No update for ${stallSeconds} seconds` : undefined}
              >
                <I aria-hidden="true" />
                <span className="att-count">{compact(n)}</span>
                <span className="att-label">{m.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p id="attention-total" className="sr-only">{full(total)} items need attention.</p>
    </section>
  )
}
