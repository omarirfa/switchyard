import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { IconContext } from "@phosphor-icons/react"
import { GitMerge, Pulse } from "@phosphor-icons/react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useCallback, useEffect, useMemo, useState } from "react"
import { RUN_CONFIG } from "../data/RunEvents.ts"
import { type Area, areaOf as areaOfGroup } from "../domain/Areas.ts"
import { type AttentionKind, FleetStore } from "../domain/Fleet.ts"
import { lanes } from "../domain/Timeline.ts"
import { runAtom } from "../state/atoms.ts"
import { AgentDrawer } from "./AgentDrawer.tsx"
import { type AgentFilter, Agents, emptyFilter } from "./Agents.tsx"
import { Attention } from "./Attention.tsx"
import { BranchGraph } from "./BranchGraph.tsx"
import { Compare } from "./Compare.tsx"
import { Autonomy, Budget, Contracts, Inbox, Precedents } from "./DecisionsTab.tsx"
import { type Lane, MergeFlow } from "./figure/MergeFlow.tsx"
import { EventLog } from "./EventLog.tsx"
import { Hero } from "./Hero.tsx"
import { Conflicts, Decisions, Overlap } from "./Panels.tsx"
import { RewindBar } from "./RewindBar.tsx"
import { RunTimeline } from "./RunTimeline.tsx"
import { StatusChart } from "./StatusChart.tsx"
import { BehaviorCards, ChurnAttention, SinceLooked } from "./SystemTab.tsx"
import { MapPanel } from "./SystemMap.tsx"
import { graphFor } from "../domain/CodeGraph.ts"
import { codeSource } from "../data/codeSource.ts"
import { type Tab, Tabs, TABS } from "./Tabs.tsx"
import { TopBar } from "./TopBar.tsx"
import { useLiveNow } from "./useLiveNow.ts"
import { AreaPanel, WorkstreamPanel } from "./WorkstreamPanel.tsx"
import { ReviewPanel } from "./ReviewPanel.tsx"
import type { ReviewSubject } from "../domain/Review.ts"

// Per-agent rows (timeline lanes, branch graph) stay readable up to this many agents.
const LANES_MAX = 12

type Panel = { readonly kind: "group"; readonly id: string } | { readonly kind: "area"; readonly id: Area | "all" }

const SINCE_KEY = "switchyard.since"
const readSince = (): number => {
  try {
    const v = Number(window.localStorage.getItem(SINCE_KEY))
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}
const writeSince = (at: number) => {
  try {
    window.localStorage.setItem(SINCE_KEY, String(at))
  } catch {
    // Storage can be blocked; the marker then lasts for this page only.
  }
}
const tabFromHash = (): Tab => {
  const h = window.location.hash.slice(1)
  return (TABS as ReadonlyArray<string>).includes(h) ? (h as Tab) : "overview"
}

const reveal = (id: string) => {
  const el = document.getElementById(id)
  if (el === null) return
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
  if (el.tabIndex >= -1) el.focus({ preventScroll: true })
}

export const App = () => {
  const result = useAtomValue(runAtom)
  const refresh = useAtomRefresh(runAtom)
  const config = RUN_CONFIG
  const empty = useMemo(() => new FleetStore(config).view(), [config])
  const liveView = AsyncResult.getOrElse(result, () => empty)
  const liveNow = useLiveNow(liveView)
  // Keep the system map's graph current with every batch, so opening the System tab
  // late never replays the whole run at once.
  useEffect(() => {
    graphFor(liveView.store, codeSource)
  }, [liveView])

  const [scrub, setScrub] = useState<number | null>(null)
  const [scrubAt, setScrubAt] = useState<number | null>(null)
  const [drawer, setDrawer] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState<AgentFilter>(emptyFilter)
  const [compareTask, setCompareTask] = useState<string | undefined>(undefined)
  const [activityMode, setActivityMode] = useState<"lanes" | "totals">("lanes")
  const [tab, setTabState] = useState<Tab>(tabFromHash)
  const [target, setTarget] = useState<string | undefined>(undefined)
  const [panel, setPanel] = useState<Panel | undefined>(undefined)
  const [views, setViews] = useState<ReadonlyMap<Area, number>>(new Map())
  const [answers, setAnswers] = useState<ReadonlyMap<string, number>>(new Map())
  const [approved, setApproved] = useState<ReadonlySet<string>>(new Set())
  const [sinceRaw, setSinceRaw] = useState(readSince)
  // The open code review, and the agent drawer to return to when it closes.
  const [review, setReview] = useState<{ readonly subject: ReviewSubject; readonly back: string | undefined } | undefined>(undefined)

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    if (window.location.hash.slice(1) !== t) window.history.replaceState(null, "", `#${t}`)
  }, [])
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.slice(1)
      if ((TABS as ReadonlyArray<string>).includes(h)) setTabState(h as Tab)
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  // Move to a section after its tab has rendered.
  useEffect(() => {
    if (target === undefined) return
    const id = requestAnimationFrame(() => {
      reveal(target)
      setTarget(undefined)
    })
    return () => cancelAnimationFrame(id)
  }, [target, tab])
  const go = (t: Tab, section: string) => {
    setTab(t)
    setTarget(section)
  }

  // Rewinding rebuilds a store from the log prefix. The slider moves at once; the rebuild
  // waits for a short pause in dragging so a 10,000-agent replay never blocks input.
  useEffect(() => {
    if (scrub === null) {
      setScrubAt(null)
      return
    }
    const id = setTimeout(() => setScrubAt(scrub), 120)
    return () => clearTimeout(id)
  }, [scrub])

  const view = useMemo(
    () => (scrubAt === null ? liveView : FleetStore.replay(liveView.store.log, scrubAt, config).view()),
    [scrubAt, scrubAt === null ? liveView : liveView.store, config]
  )
  const now = scrubAt === null ? liveNow : scrubAt
  const running = scrubAt === null && view.phase === "running"
  const small = view.agents <= LANES_MAX
  const tl = useMemo(() => (small ? lanes(view.store, now) : undefined), [view, small, Math.floor(now / 250)])

  const reset = useCallback(() => {
    setScrub(null)
    setDrawer(undefined)
    setFilter(emptyFilter)
    setCompareTask(undefined)
    setActivityMode("lanes")
    setPanel(undefined)
    setReview(undefined)
    setAnswers(new Map())
    setApproved(new Set())
  }, [])
  const replay = () => {
    reset()
    refresh()
  }
  const open = useCallback((id: string) => {
    setPanel(undefined)
    setReview(undefined)
    setDrawer(id)
  }, [])
  const openReview = useCallback((subject: ReviewSubject) => {
    setPanel(undefined)
    setReview({ subject, back: drawer })
    setDrawer(undefined)
  }, [drawer])
  const reviewMerge = useCallback((taskId: string) => openReview({ kind: "merge", taskId }), [openReview])
  const reviewBranch = useCallback((agentId: string) => openReview({ kind: "branch", agentId }), [openReview])
  const closeReview = useCallback(() => {
    if (review?.back !== undefined) setDrawer(review.back)
    setReview(undefined)
  }, [review])
  const latestMerge = () => {
    const d = [...view.store.decisions].reverse().find((x) => x.merged.length > 0)
    if (d !== undefined) reviewMerge(d.taskId)
  }
  const close = useCallback(() => setDrawer(undefined), [])
  const closePanel = useCallback(() => setPanel(undefined), [])
  const seen = (area: Area) => setViews((m) => new Map(m).set(area, (m.get(area) ?? 0) + 1))
  const openGroup = (group: string) => {
    seen(areaOfGroup(group))
    setPanel({ kind: "group", id: group })
  }
  const openArea = (area: Area | "all") => {
    if (area !== "all") seen(area)
    setPanel({ kind: "area", id: area })
  }
  const onChip = (kind: "agent" | "group" | "more", id: string) => {
    if (kind === "agent") open(id)
    else if (kind === "group") openGroup(id)
    else openArea("all")
  }
  const onLane = (lane: Lane) => {
    if (lane.kind === "agent") open(lane.id)
    else openArea(lane.id as Area)
  }
  const showAll = (group: string) => {
    setPanel(undefined)
    setFilter({ ...emptyFilter, group })
    go("work", "agents")
  }

  // The marker lives in run time. A replay that starts over clears a marker set later in the run.
  const since = sinceRaw > liveView.now ? 0 : sinceRaw
  const markSeen = () => {
    setSinceRaw(view.now)
    writeSince(view.now)
  }
  const resetSince = () => {
    setSinceRaw(0)
    writeSince(0)
  }

  const scope = (label: string, set: ReadonlySet<string>) => {
    setFilter({ ...emptyFilter, sort: "failing", ids: { label, set } })
    go("work", "agents")
  }
  const onAttention = (kind: AttentionKind) => {
    const store = view.store
    switch (kind) {
      case "decisions":
        go("decisions", "inbox")
        return
      case "contracts":
        go("decisions", "contracts")
        return
      case "conflicts": {
        const ids = new Set<string>()
        for (const c of store.conflicts.values()) if (c.to === undefined) for (const id of c.agentIds) ids.add(id)
        if (small) go("work", "conflicts")
        else scope("In open conflicts", ids)
        return
      }
      case "failed":
        setFilter({ ...emptyFilter, statuses: new Set(["failed"]) })
        go("work", "agents")
        return
      case "blocked":
        setFilter({ ...emptyFilter, statuses: new Set(["blocked"]) })
        go("work", "agents")
        return
      case "stalled": {
        const ids = new Set<string>()
        for (const id of store.active) {
          const rec = store.agents.get(id)
          if (rec !== undefined && view.now - rec.lastAt > config.stallMs) ids.add(id)
        }
        scope("Stalled", ids)
        return
      }
      case "overlap":
        go("work", "overlap")
        return
      case "ready": {
        const ids = new Set<string>()
        for (const t of store.tasks.values()) {
          if (t.decision !== undefined) continue
          if (t.agents.every((id) => ["done", "failed"].includes(store.agents.get(id)?.status ?? ""))) for (const id of t.agents) ids.add(id)
        }
        scope("Tasks ready to merge", ids)
        return
      }
    }
  }
  const onFile = (file: string) => scope(`Editing ${file}`, new Set(view.store.fileEditors.get(file) ?? []))

  const lanesShown = small && activityMode === "lanes" && tl !== undefined
  const singleDecision = view.tasks === 1 ? view.decisions[0] : undefined

  return (
    <IconContext.Provider value={{ size: 16, weight: "light" }}>
      <div className="shell">
        <a className="skip" href="#main">Skip to run</a>
        <TopBar view={liveView} onReplay={replay} />
        <RewindBar liveNow={liveNow} at={scrub} onChange={setScrub} onLive={() => setScrub(null)} />

        {AsyncResult.isFailure(result) && (
          <p className="error" role="alert">
            The event feed sent an event that does not match the event schema. Open the browser console to see which field failed.
          </p>
        )}

        <Tabs
          tab={tab}
          onTab={setTab}
          badges={{
            overview: undefined,
            work: view.active,
            decisions: view.inboxOpenCount + view.contractsPendingCount,
            system: undefined
          }}
        />

        <Attention view={view} stallSeconds={config.stallMs / 1000} onSelect={onAttention} />

        <main id="main" className="main" tabIndex={-1}>
          {tab === "overview" && (
            <div id="tab-overview" role="tabpanel" aria-labelledby="tabbtn-overview" className="tabpanel">
              <Hero view={view} now={now} onChip={onChip} />
              <div className="overview-grid">
                <section className="panel activity" aria-labelledby="activity-title">
                  <header className="panel-head">
                    <h2 id="activity-title">
                      <Pulse aria-hidden="true" />
                      Activity
                    </h2>
                    {small && (
                      <div className="segmented segmented-small" role="radiogroup" aria-label="Activity view">
                        {(["lanes", "totals"] as const).map((m) => (
                          <button
                            key={m}
                            id={`activity-${m}`}
                            type="button"
                            role="radio"
                            aria-checked={activityMode === m}
                            className={activityMode === m ? "seg on" : "seg"}
                            onClick={() => setActivityMode(m)}
                          >
                            {m === "lanes" ? "Per agent" : "Totals"}
                          </button>
                        ))}
                      </div>
                    )}
                  </header>
                  {lanesShown ? <RunTimeline tl={tl} running={running} /> : <StatusChart view={view} now={now} />}
                </section>
                <section className="panel merge-panel" aria-labelledby="mq-title">
                  <header className="panel-head">
                    <h2 id="mq-title">
                      <GitMerge aria-hidden="true" />
                      Merge queue
                    </h2>
                    <span className="count-text">{view.agents <= 8 ? "One rail per agent" : "One rail per product area"}</span>
                  </header>
                  <MergeFlow view={view} onLane={onLane} onMain={latestMerge} />
                </section>
              </div>
            </div>
          )}

          {tab === "work" && (
            <div id="tab-work" role="tabpanel" aria-labelledby="tabbtn-work" className="tabpanel desk">
              <div className="main-col">
                <Agents view={view} filter={filter} onFilter={setFilter} onOpen={open} />
                <Compare view={view} taskId={compareTask} onTask={setCompareTask} onOpen={open} onReview={reviewBranch} />
                <EventLog log={view.tail} total={view.eventCount} onOpen={open} />
              </div>
              <aside className="rail" aria-label="Overlaps and conflicts">
                <Overlap view={view} onFile={onFile} />
                <Conflicts view={view} onOpen={open} />
                {small && tl !== undefined && <BranchGraph tl={tl} decision={singleDecision} />}
              </aside>
            </div>
          )}

          {tab === "decisions" && (
            <div id="tab-decisions" role="tabpanel" aria-labelledby="tabbtn-decisions" className="tabpanel">
              <div className="desk">
                <div className="main-col">
                  <Inbox view={view} local={answers} onAnswer={(id, c) => setAnswers((m) => new Map(m).set(id, c))} onOpen={open} />
                  <Contracts view={view} approved={approved} onApprove={(id) => setApproved((s) => new Set(s).add(id))} />
                </div>
                <aside className="rail" aria-label="Budget, precedents, and merges">
                  <Budget view={view} />
                  <Decisions view={view} running={running} onOpen={open} onReview={reviewMerge} />
                  <Precedents view={view} />
                </aside>
              </div>
              <Autonomy view={view} />
            </div>
          )}

          {tab === "system" && (
            <div id="tab-system" role="tabpanel" aria-labelledby="tabbtn-system" className="tabpanel">
              <MapPanel view={view} since={since} onArea={openArea} onGroup={openGroup} onOpenAgent={open} onReview={reviewMerge} />
              <div className="system-grid">
                <SinceLooked view={view} since={since} onMark={markSeen} onReset={resetSince} onArea={openArea} />
                <ChurnAttention view={view} views={views} onArea={openArea} />
              </div>
              <BehaviorCards view={view} onOpen={open} onReview={reviewMerge} />
            </div>
          )}
        </main>


        {panel?.kind === "group" && (
          <WorkstreamPanel view={view} group={panel.id} onClose={closePanel} onOpenAgent={open} onShowAll={showAll} onReview={reviewMerge} />
        )}
        {panel?.kind === "area" && (
          <AreaPanel view={view} area={panel.id} since={since} onClose={closePanel} onGroup={openGroup} onOpenAgent={open} />
        )}
        {drawer !== undefined && <AgentDrawer view={view} agentId={drawer} onClose={close} onOpen={open} onReview={openReview} />}
        {review !== undefined && <ReviewPanel key={JSON.stringify(review.subject)} view={view} subject={review.subject} onClose={closeReview} onOpenAgent={open} />}
      </div>
    </IconContext.Provider>
  )
}
