import { ChatCircleDots, Check, Clock, FileText, Lightning, ShieldCheck, Stack } from "@phosphor-icons/react"
import { useState } from "react"
import { type Area, AREAS, areaLabel, DAILY_DECISION_LIMIT, ownerOf } from "../domain/Areas.ts"
import type { DecisionCard, FleetView, SetupStats } from "../domain/Fleet.ts"
import { agentName, clock, full, pct, plural } from "./format.ts"

// SAMPLE DATA. Review cadence and area risk levels below are example settings.
export const REVIEW_WINDOW_MS = 20_000
const AREA_RISK: Record<Area, "low" | "medium" | "high"> = {
  accounts: "high",
  billing: "high",
  data: "medium",
  content: "low",
  messaging: "low",
  platform: "low",
  developer: "low",
  ops: "low"
}
const NEW_SETUPS = new Set(["k-13"])
const AUTO = { pass: 0.88, revert: 0.02, merges: 25, probationMerges: 40 }

const riskTag = (r: "low" | "medium" | "high") => <span className={`risk-tag risk-${r}`}>{r === "low" ? "Low risk" : r === "medium" ? "Medium risk" : "High risk"}</span>

export const Budget = ({ view }: { readonly view: FleetView }) => {
  const next = Math.ceil(Math.max(1, view.now) / REVIEW_WINDOW_MS) * REVIEW_WINDOW_MS
  const escalations = view.tasks === 0 ? 0 : (view.answeredBy.owner + view.inboxOpenCount) / view.tasks * 100
  const held = view.inboxOpen.filter((c) => !c.urgent).length
  return (
    <section className="panel" aria-labelledby="budget-title">
      <header className="panel-head">
        <h2 id="budget-title"><Clock aria-hidden="true" /> Attention budget</h2>
        <span className="count-text">Next review window {clock(next)}</span>
      </header>
      <dl className="mini-stats">
        <div>
          <dt>Escalations per 100 tasks</dt>
          <dd>{escalations.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Answered by a precedent</dt>
          <dd>{full(view.answeredBy.precedent)}</dd>
        </div>
        <div>
          <dt>Default after max wait</dt>
          <dd>{full(view.answeredBy.default)}</dd>
        </div>
        <div>
          <dt>Held for the next window</dt>
          <dd>{full(held)}</dd>
        </div>
      </dl>
      <ul className="owners">
        {view.owners.map((o) => (
          <li key={o.area}>
            <span className="owner-name">{ownerOf(o.area)}</span>
            <span className="meter" role="img" aria-label={`${o.delivered} of ${DAILY_DECISION_LIMIT} decisions used`}>
              <span style={{ width: `${Math.min(100, (o.delivered / DAILY_DECISION_LIMIT) * 100)}%` }} className={o.delivered >= DAILY_DECISION_LIMIT ? "over" : undefined} />
            </span>
            <span className="owner-count">{o.delivered}/{DAILY_DECISION_LIMIT}</span>
            <span className="quiet owner-open">{o.open > 0 ? `${o.open} open${o.urgent > 0 ? `, ${o.urgent} urgent` : ""}` : "Clear"}</span>
          </li>
        ))}
      </ul>
      <p className="quiet small">Sample settings: 20 decisions per owner per day, review windows every 20 seconds of run time, and an 18 second maximum wait for low-risk questions. Urgent cards arrive at once.</p>
    </section>
  )
}

const Card = ({ card, local, onAnswer, onOpen }: {
  readonly card: DecisionCard
  readonly local: number | undefined
  readonly onAnswer: (id: string, choice: number) => void
  readonly onOpen: (id: string) => void
}) => {
  const [choice, setChoice] = useState(card.recommended)
  const highest = card.options.reduce((m, o) => (o.risk === "high" ? "high" : o.risk === "medium" && m !== "high" ? "medium" : m), "low" as "low" | "medium" | "high")
  return (
    <article className={card.urgent ? "dcard dcard-urgent" : "dcard"} aria-labelledby={`q-${card.decisionId}`}>
      <header className="dcard-head">
        <span className="chip">{areaLabel[card.area]}</span>
        <span className="quiet">{card.group}</span>
        {card.urgent && <span className="risk-tag risk-high">Urgent</span>}
        {riskTag(highest)}
        <span className="quiet dcard-age">asked {clock(card.askedAt)}</span>
      </header>
      <h3 id={`q-${card.decisionId}`}>{card.question}</h3>
      <p className="quiet small">
        {card.agentIds.length > 1 ? `${card.agentIds.length} agents asked this. ` : ""}
        <button id={`q-agent-${card.decisionId}`} type="button" className="link-btn" onClick={() => onOpen(card.agentIds[0]!)}>{agentName(card.agentIds[0]!)}</button>
        {card.agentIds.length > 1 ? " and others continue" : " continues"} assuming: {card.assumption}
      </p>
      {local === undefined
        ? (
          <fieldset className="options">
            <legend className="sr-only">Options</legend>
            {card.options.map((o, i) => (
              <label key={o.label} className={choice === i ? "option on" : "option"} htmlFor={`opt-${card.decisionId}-${i}`}>
                <input id={`opt-${card.decisionId}-${i}`} type="radio" name={`opt-${card.decisionId}`} checked={choice === i} onChange={() => setChoice(i)} />
                <span className="option-label">
                  {o.label}
                  {i === card.recommended && <span className="rec-tag">Recommended</span>}
                </span>
                <span className="option-cost">{o.cost}</span>
                {riskTag(o.risk)}
              </label>
            ))}
          </fieldset>
        )
        : (
          <p className="answered">
            <Check aria-hidden="true" />
            Answered in this preview: {card.options[local]?.label}. A live inbox stores it as a precedent for every {card.group} task.
          </p>
        )}
      {local === undefined && (
        <div className="dcard-foot">
          <span className="quiet small">Applies to every {card.group} task</span>
          <button id={`answer-${card.decisionId}`} type="button" className="btn btn-primary" onClick={() => onAnswer(card.decisionId, choice)}>
            Send answer
          </button>
        </div>
      )}
    </article>
  )
}

// Several workstreams often ask the same question. One row per question and answer keeps
// the list readable at fleet scale.
const groupAnswers = (cards: ReadonlyArray<DecisionCard>) => {
  const out = new Map<string, { key: string; question: string; answer: string; by: string; at: number; groups: Array<string> }>()
  for (const c of cards) {
    const answer = c.options[c.choice ?? 0]?.label ?? ""
    const key = `${c.question}|${answer}|${c.by}`
    const g = out.get(key)
    if (g === undefined) out.set(key, { key, question: c.question, answer, by: c.by ?? "owner", at: c.answeredAt ?? 0, groups: [c.group] })
    else if (!g.groups.includes(c.group)) g.groups.push(c.group)
  }
  return [...out.values()]
}

export const Inbox = ({ view, local, onAnswer, onOpen }: {
  readonly view: FleetView
  readonly local: ReadonlyMap<string, number>
  readonly onAnswer: (id: string, choice: number) => void
  readonly onOpen: (id: string) => void
}) => (
  <section id="inbox" className="panel" aria-labelledby="inbox-title" tabIndex={-1}>
    <header className="panel-head">
      <h2 id="inbox-title"><ChatCircleDots aria-hidden="true" /> Decision inbox</h2>
      <span className="count-text">{plural(view.inboxOpenCount, "open card")}</span>
    </header>
    {view.inboxOpen.length === 0
      ? <p className="quiet">No decisions are waiting. Agents ask here when a task leaves a choice to the area owner.</p>
      : (
        <div className="dcards">
          {view.inboxOpen.map((c) => <Card key={c.decisionId} card={c} local={local.get(c.decisionId)} onAnswer={onAnswer} onOpen={onOpen} />)}
        </div>
      )}
    {view.inboxAnswered.length > 0 && (
      <>
        <h3 className="sub-title">Recently answered</h3>
        <ul className="answered-list">
          {groupAnswers(view.inboxAnswered).map((g) => (
            <li key={g.key}>
              <span className="ev-time">{clock(g.at)}</span>
              <span className="answered-q">
                {g.question}
                {g.groups.length > 1 && <span className="quiet"> ({g.groups.length} workstreams)</span>}
              </span>
              <span className="answered-a">{g.answer}</span>
              <span className={`by-tag by-${g.by}`}>{g.by === "owner" ? "Owner" : g.by === "precedent" ? "Precedent" : "Default after wait"}</span>
            </li>
          ))}
        </ul>
      </>
    )}
  </section>
)

const listOf = (xs: ReadonlyArray<string>) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)

const groupPrecedents = (list: FleetView["precedents"]) => {
  const out = new Map<string, { key: string; question: string; answer: string; area: Area; scopes: Array<string> }>()
  for (const p of list) {
    const key = `${p.question}|${p.answer}`
    const g = out.get(key)
    if (g === undefined) out.set(key, { key, question: p.question, answer: p.answer, area: p.area, scopes: [p.scope] })
    else if (!g.scopes.includes(p.scope)) g.scopes.push(p.scope)
  }
  return [...out.values()]
}

export const Precedents = ({ view }: { readonly view: FleetView }) => (
  <section className="panel" aria-labelledby="prec-title">
    <header className="panel-head">
      <h2 id="prec-title"><Stack aria-hidden="true" /> Precedents</h2>
      <span className="count-text">{full(view.answeredBy.owner)} stored</span>
    </header>
    {view.precedents.length === 0
      ? <p className="quiet">An owner's answer becomes a precedent that agents check before asking again.</p>
      : (
        <ul className="prec-list">
          {groupPrecedents(view.precedents).map((p) => (
            <li key={p.key}>
              <p className="prec-q">{p.question}</p>
              <p className="prec-a"><Check aria-hidden="true" /> {p.answer}</p>
              <p className="quiet small">{ownerOf(p.area)}, applies to {listOf(p.scopes.map((x) => x.replace(/^every /, "").replace(/ tasks?$/, "")))} tasks, review in 90 days</p>
            </li>
          ))}
        </ul>
      )}
  </section>
)

export const Contracts = ({ view, approved, onApprove }: {
  readonly view: FleetView
  readonly approved: ReadonlySet<string>
  readonly onApprove: (taskId: string) => void
}) => {
  const store = view.store
  return (
    <section id="contracts" className="panel" aria-labelledby="contracts-title" tabIndex={-1}>
      <header className="panel-head">
        <h2 id="contracts-title"><FileText aria-hidden="true" /> Intent contracts</h2>
        <span className="count-text">{full(view.contractsByCoordinator)} approved by the coordinator, {full(view.contractsByOwner)} by owners</span>
      </header>
      <p className="quiet small">Each task starts from a one-screen contract: goal, limits, files in scope, and acceptance tests that agents cannot edit after approval. The coordinator approves low-risk contracts and lists them for the owner's next window. Owners approve high-risk ones before work starts.</p>
      <h3 className="sub-title">Waiting for an owner <span className="count-text">{full(view.contractsPendingCount)}</span></h3>
      {view.contractsPending.length === 0
        ? <p className="quiet">No high-risk contract is waiting.</p>
        : (
          <div className="contract-grid">
            {view.contractsPending.map((c) => (
              <article key={c.taskId} className="contract">
                <header className="dcard-head">
                  <span className="chip">{c.group}</span>
                  {riskTag(c.risk)}
                  <span className="quiet dcard-age">submitted {clock(c.submittedAt)}</span>
                </header>
                <h4>{c.goal}</h4>
                <dl className="kv small">
                  <dt>Limits</dt>
                  <dd>{c.constraints.join(" ")}</dd>
                  <dt>Files</dt>
                  <dd className="files">{c.files.map((f) => <code key={f} className="file-chip">{f}</code>)}</dd>
                  <dt>Tests</dt>
                  <dd>{c.tests.join(". ")}.</dd>
                </dl>
                {approved.has(c.taskId)
                  ? <p className="answered"><Check aria-hidden="true" /> Approved in this preview.</p>
                  : (
                    <button id={`approve-${c.taskId}`} type="button" className="btn btn-primary" onClick={() => onApprove(c.taskId)}>
                      Approve contract
                    </button>
                  )}
              </article>
            ))}
          </div>
        )}
      <h3 className="sub-title">Recently approved</h3>
      <ul className="answered-list">
        {view.contractsRecent.map((c) => (
          <li key={c.taskId}>
            <span className="ev-time">{clock(c.approvedAt ?? 0)}</span>
            <span className="answered-q">{c.goal}</span>
            <span className="quiet">{store.tasks.get(c.taskId)?.group}</span>
            <span className={c.by === "owner" ? "by-tag by-owner" : "by-tag by-precedent"}>
              {c.by === "owner" ? (c.edited ? "Owner, edited" : "Owner") : "Coordinator"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Standing = "auto" | "review" | "probation" | "building"
const standing = (s: SetupStats | undefined, area: Area): Standing => {
  if (s === undefined) return "building"
  const passRate = s.finished === 0 ? 0 : s.passed / s.finished
  const revertRate = s.merged === 0 ? 0 : s.reverted / s.merged
  if (NEW_SETUPS.has(s.setup) && s.merged < AUTO.probationMerges) return "probation"
  if (AREA_RISK[area] === "high") return "review"
  if (s.merged < AUTO.merges) return "building"
  return passRate >= AUTO.pass && revertRate <= AUTO.revert && s.overrides <= 2 ? "auto" : "review"
}
const standingLabel: Record<Standing, string> = {
  auto: "Merges on its own",
  review: "Owner reviews",
  probation: "Probation",
  building: "Building record"
}

export const Autonomy = ({ view }: { readonly view: FleetView }) => {
  const setups = [...new Set(view.setups.map((s) => s.setup))].sort()
  const byKey = new Map(view.setups.map((s) => [`${s.setup}|${s.area}`, s]))
  return (
    <section className="panel" aria-labelledby="auto-title">
      <header className="panel-head">
        <h2 id="auto-title"><ShieldCheck aria-hidden="true" /> Earned autonomy</h2>
        <span className="count-text">{plural(view.reverts, "revert")} so far</span>
      </header>
      <p className="quiet small">
        Each agent setup (model, prompt, and tool versions) earns a record per area. In low and medium risk areas a setup merges without a person once it has {AUTO.merges} merges, a {pct(AUTO.pass, 1)} test pass rate, and at most {pct(AUTO.revert, 1)} reverts. New setups such as k-13 stay on probation for {AUTO.probationMerges} merges. High-risk areas always go to the owner.
      </p>
      {setups.length === 0
        ? <p className="quiet">Records appear once agents finish their first tasks.</p>
        : (
          <div className="table-scroll">
            <table className="auto-table">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  {setups.map((s) => <th key={s} scope="col">{s}{NEW_SETUPS.has(s) ? " (new)" : ""}</th>)}
                </tr>
              </thead>
              <tbody>
                {AREAS.filter((a) => setups.some((x) => byKey.has(`${x}|${a}`))).map((a) => (
                  <tr key={a}>
                    <th scope="row">
                      {areaLabel[a]}
                      <span className={`risk-dot risk-${AREA_RISK[a]}`} title={`${AREA_RISK[a]} risk`} aria-hidden="true" />
                    </th>
                    {setups.map((setup) => {
                      const s = byKey.get(`${setup}|${a}`)
                      const st = standing(s, a)
                      return (
                        <td key={setup} className={`auto-${st}`}>
                          {s === undefined
                            ? <span className="quiet">No tasks</span>
                            : (
                              <>
                                <span className="auto-rate">{pct(s.passed, Math.max(1, s.finished))}</span>
                                <span className="quiet auto-detail">{full(s.merged)} merges, {full(s.reverted)} reverts</span>
                                <span className="auto-state">
                                  {st === "auto" && <Lightning aria-hidden="true" />}
                                  {standingLabel[st]}
                                </span>
                              </>
                            )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </section>
  )
}
