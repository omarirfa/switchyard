import { ChatCircleDots, MapTrifold, SquaresFour, UsersThree } from "@phosphor-icons/react"
import type { Icon } from "@phosphor-icons/react"
import { type KeyboardEvent, useRef } from "react"
import { compact } from "./format.ts"

export const TABS = ["overview", "work", "decisions", "system"] as const
export type Tab = typeof TABS[number]

const meta: Record<Tab, { readonly label: string; readonly icon: Icon; readonly hint: string }> = {
  overview: { label: "Overview", icon: SquaresFour, hint: "Run health and what needs a person" },
  work: { label: "Work", icon: UsersThree, hint: "Agents, branches, overlaps, and events" },
  decisions: { label: "Decisions", icon: ChatCircleDots, hint: "Questions, contracts, merges, and autonomy" },
  system: { label: "System", icon: MapTrifold, hint: "What changed in each product area" }
}

// One tab per job. Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
export const Tabs = ({ tab, onTab, badges }: {
  readonly tab: Tab
  readonly onTab: (t: Tab) => void
  readonly badges: Readonly<Record<Tab, number | undefined>>
}) => {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    const to = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : step === 0 ? -1 : (i + step + TABS.length) % TABS.length
    if (to < 0) return
    e.preventDefault()
    onTab(TABS[to]!)
    refs.current[to]?.focus()
  }
  return (
    <nav className="tabs-wrap" aria-label="Views">
      <div className="tabs" role="tablist" aria-label="Views">
        {TABS.map((t, i) => {
          const m = meta[t]
          const I = m.icon
          const badge = badges[t]
          const on = tab === t
          return (
            <button
              key={t}
              ref={(el) => {
                refs.current[i] = el
              }}
              id={`tabbtn-${t}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`tab-${t}`}
              tabIndex={on ? 0 : -1}
              className={on ? "tab on" : "tab"}
              title={m.hint}
              onClick={() => onTab(t)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <I aria-hidden="true" />
              {m.label}
              {badge !== undefined && badge > 0 && <span className="tab-badge">{compact(badge)}</span>}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
