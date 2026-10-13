import type { Change, GroupMeta } from "../domain/Analyze.ts"
import type { GroupType, ReviewFocus } from "../domain/Review.ts"

// SAMPLE DATA. Builds plausible file contents for a simulated fleet agent from its
// task verb, workstream, and the files its commits touched. Contents are generated
// when someone opens a review, so 10,000 agents cost nothing until then. The live
// feed replaces this with each branch's real contents; see FILLER_ITEMS.md.

export const VERBS = ["Add retries to", "Paginate", "Validate input for", "Cache reads in", "Add metrics to", "Fix timeouts in", "Type the responses of", "Add tests for", "Log errors in", "Speed up"] as const
type Verb = "retries" | "paginate" | "validate" | "cache" | "metrics" | "timeouts" | "types" | "tests" | "log" | "speed"
const VERB_KEYS: ReadonlyArray<Verb> = ["retries", "paginate", "validate", "cache", "metrics", "timeouts", "types", "tests", "log", "speed"]

export const verbOf = (title: string): Verb => {
  const i = VERBS.findIndex((v) => title.startsWith(v))
  return VERB_KEYS[i < 0 ? 0 : i]!
}

const ENTITY: Record<string, string> = {
  auth: "Session", billing: "Invoice", search: "SearchResult", uploads: "Upload", notifications: "Notification",
  admin: "AdminAction", "rate-limits": "RateLimit", webhooks: "Webhook", "audit-log": "AuditEntry", i18n: "Translation",
  payments: "Payment", reports: "Report", onboarding: "OnboardingStep", settings: "Setting", teams: "Team",
  invites: "Invite", sso: "SsoConnection", exports: "Export", imports: "Import", analytics: "Metric",
  "feature-flags": "FeatureFlag", emails: "Email", "api-gateway": "Route", cache: "CacheEntry", queues: "Job",
  scheduler: "Schedule", media: "MediaFile", comments: "Comment", permissions: "Permission", sessions: "Session",
  "docs-site": "DocPage", cli: "Command", "sdk-js": "ClientCall", "sdk-python": "ClientCall", "mobile-api": "Device",
  "status-page": "Incident", backups: "Backup", migrations: "Migration", observability: "Trace", pricing: "Plan"
}

interface Names {
  readonly T: string
  readonly Ts: string
  readonly ts: string
  readonly table: string
  readonly route: string
  readonly metric: string
}

const names = (group: string): Names => {
  const T = ENTITY[group] ?? "Record"
  const Ts = T.endsWith("y") ? `${T.slice(0, -1)}ies` : T.endsWith("s") ? `${T}es` : `${T}s`
  const ts = Ts[0]!.toLowerCase() + Ts.slice(1)
  const table = Ts.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
  return { T, Ts, ts, table, route: `/api/${table.replace(/_/g, "-")}`, metric: group.replace(/-/g, "_") }
}

// Small seeded choices so competing attempts on one task differ.
const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const choose = <A,>(xs: ReadonlyArray<A>, seed: number, salt: number) => xs[(seed >>> salt) % xs.length]!

interface Knobs { readonly attempts: number; readonly backoff: number; readonly ttl: number; readonly page: number; readonly timeout: string }
const knobs = (seed: number): Knobs => ({
  attempts: choose([3, 4, 5], seed, 1),
  backoff: choose([100, 200, 250], seed, 3),
  ttl: choose([30, 60, 120], seed, 5),
  page: choose([25, 50, 100], seed, 7),
  timeout: choose(["1_500", "2_000", "3_000"], seed, 9)
})

type Kind = "handler" | "service" | "data" | "config"
const kindOf = (path: string): Kind => {
  const b = path.slice(path.lastIndexOf("/") + 1).replace(/\.ts$/, "")
  if (["routes", "api", "handlers", "views", "index"].includes(b)) return "handler"
  if (["schema", "types", "models", "validate"].includes(b)) return "data"
  if (b === "config") return "config"
  return "service"
}
const stemOf = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.ts$/, "")
const L = (xs: ReadonlyArray<string | false>) => xs.filter((x): x is string => x !== false).join("\n") + "\n"

const service = (N: Names, k: Knobs, verb: Verb, on: boolean, data: string): string => {
  const v = (w: Verb) => verb === w && on
  const list = verb === "types" && !on ? "Promise<any[]>" : `Promise<${N.T}[]>`
  const opts = verb === "timeouts" ? ", { timeoutMs: QUERY_TIMEOUT_MS }" : ""
  const query = v("paginate")
    ? `db.query("select * from ${N.table} where team_id = ? and id > ? order by id limit ?", [teamId, cursor, limit + 1]${opts})`
    : `db.query("select * from ${N.table} where team_id = ? order by id", [teamId]${opts})`
  const fetch = v("retries") ? `await withRetry(() => ${query}, { attempts: ${k.attempts}, backoffMs: ${k.backoff} })` : `await ${query}`
  const ind = v("log") ? "    " : "  "
  const body = [
    v("validate") && `${ind}assertId(teamId, "teamId")`,
    v("cache") && `${ind}const key = \`${N.ts}:\${teamId}\``,
    v("cache") && `${ind}const hit = await cache.get<${N.T}[]>(key)`,
    v("cache") && `${ind}if (hit !== undefined) return hit`,
    v("metrics") && `${ind}const started = performance.now()`,
    `${ind}const rows = ${fetch}`,
    v("tests") && `${ind}if (rows.length === 0) return []`,
    v("metrics") && `${ind}metrics.histogram("${N.metric}.list_ms", performance.now() - started)`,
    ...(v("paginate")
      ? [`${ind}const items = rows.slice(0, limit).map(to${N.T})`, `${ind}return { items, next: rows.length > limit ? items[items.length - 1]?.id : undefined }`]
      : v("cache")
      ? [`${ind}const items = rows.map(to${N.T})`, `${ind}await cache.put(key, items, { ttlSeconds: ${k.ttl} })`, `${ind}return items`]
      : [`${ind}return rows.map(to${N.T})`])
  ]
  return L([
    `import { db } from "../../db"`,
    v("retries") && `import { withRetry } from "../../lib/retry"`,
    v("cache") && `import { cache } from "../../lib/cache"`,
    v("metrics") && `import { metrics } from "../../lib/metrics"`,
    v("log") && `import { log } from "../../lib/log"`,
    v("validate") && `import { assertId } from "../../lib/ids"`,
    `import type { ${N.T} } from "./${data}"`,
    ``,
    verb === "timeouts" && `const QUERY_TIMEOUT_MS = ${on ? k.timeout : "30_000"}`,
    v("paginate") && `const PAGE_SIZE = ${k.page}`,
    (verb === "timeouts" || v("paginate")) && ``,
    v("paginate")
      ? `export async function list${N.Ts}(teamId: string, cursor = "", limit = PAGE_SIZE): Promise<{ items: ${N.T}[]; next: string | undefined }> {`
      : `export async function list${N.Ts}(teamId: string): ${list} {`,
    v("log") && `  try {`,
    ...body,
    v("log") && `  } catch (error) {`,
    v("log") && `    log.error("${N.metric}.list failed", { teamId, error })`,
    v("log") && `    throw error`,
    v("log") && `  }`,
    `}`,
    ``,
    `export async function get${N.T}(id: string): Promise<${N.T} | undefined> {`,
    `  const row = await db.first("select * from ${N.table} where id = ?", [id]${opts})`,
    `  return row ? to${N.T}(row) : undefined`,
    `}`,
    ``,
    `export async function get${N.Ts}(ids: string[]): Promise<${N.T}[]> {`,
    ...(v("speed")
      ? [
        `  const found = await Promise.all(ids.map((id) => get${N.T}(id)))`,
        `  return found.filter((x): x is ${N.T} => x !== undefined)`
      ]
      : [
        `  const out: ${N.T}[] = []`,
        `  for (const id of ids) {`,
        `    const item = await get${N.T}(id)`,
        `    if (item) out.push(item)`,
        `  }`,
        `  return out`
      ]),
    `}`,
    ``,
    `${v("tests") ? "export " : ""}function to${N.T}(row: Record<string, unknown>): ${N.T} {`,
    `  return { id: String(row.id), teamId: String(row.team_id), name: String(row.name), createdAt: String(row.created_at) }`,
    `}`
  ])
}

const handler = (N: Names, k: Knobs, verb: Verb, on: boolean, svc: string, data: string): string => {
  const v = (w: Verb) => verb === w && on
  return L([
    `import { Hono } from "hono"`,
    `import { get${N.T}, list${N.Ts}${verb === "speed" ? `, count${N.Ts}` : ""} } from "./${svc}"`,
    v("types") && `import type { ${N.T}, ${N.T}List } from "./${data}"`,
    v("validate") && `import { isId } from "../../lib/ids"`,
    v("metrics") && `import { timed } from "../../lib/metrics"`,
    v("log") && `import { log } from "../../lib/log"`,
    ``,
    `export const routes = new Hono()`,
    ``,
    v("metrics") ? `routes.get("${N.route}", timed("${N.metric}.list"), async (c) => {` : `routes.get("${N.route}", async (c) => {`,
    `  const teamId = c.req.query("team") ?? ""`,
    v("validate") && `  if (!isId(teamId)) return c.json({ error: "invalid_team" }, 400)`,
    ...(v("paginate")
      ? [
        `  const limit = Math.min(Number(c.req.query("limit") ?? ${k.page}), 200)`,
        `  const { items, next } = await list${N.Ts}(teamId, c.req.query("cursor") ?? "", limit)`,
        `  return c.json({ items, next })`
      ]
      : verb === "speed"
      ? (on
        ? [`  const [items, total] = await Promise.all([list${N.Ts}(teamId), count${N.Ts}(teamId)])`, `  return c.json({ items, total })`]
        : [`  const items = await list${N.Ts}(teamId)`, `  const total = await count${N.Ts}(teamId)`, `  return c.json({ items, total })`])
      : [
        `  const items = await list${N.Ts}(teamId)`,
        verb === "tests" && !on && `  if (items.length === 0) return c.json({ error: "not_found" }, 404)`,
        v("cache") && `  c.header("Cache-Control", "private, max-age=${k.ttl}")`,
        verb === "types" ? (on ? `  return c.json<${N.T}List>({ items })` : `  return c.json({ items } as any)`) : `  return c.json({ items })`
      ]),
    `})`,
    ``,
    `routes.get("${N.route}/:id", async (c) => {`,
    ...((v("timeouts") || v("retries"))
      ? [
        `  try {`,
        `    const item = await get${N.T}(c.req.param("id"))`,
        `    return item ? c.json(item) : c.json({ error: "not_found" }, 404)`,
        `  } catch (error) {`,
        v("timeouts")
          ? `    if (error instanceof Error && error.name === "TimeoutError") return c.json({ error: "timeout" }, 504)`
          : `    if (error instanceof Error && error.name === "RetryExhausted") return c.json({ error: "unavailable" }, 503, { "Retry-After": "${Math.ceil((k.backoff * k.attempts) / 1000) || 1}" })`,
        `    throw error`,
        `  }`
      ]
      : [
        `  const item = await get${N.T}(c.req.param("id"))`,
        verb === "types" && on ? `  return item ? c.json<${N.T}>(item) : c.json({ error: "not_found" }, 404)` : `  return item ? c.json(item) : c.json({ error: "not_found" }, 404)`
      ]),
    `})`,
    v("log") && ``,
    v("log") && `routes.onError((error, c) => {`,
    v("log") && `  log.error("${N.metric} route failed", { path: c.req.path, requestId: c.req.header("cf-ray"), error })`,
    v("log") && `  return c.json({ error: "internal" }, 500)`,
    v("log") && `})`
  ])
}

const data = (N: Names, k: Knobs, verb: Verb, on: boolean): string => {
  const v = (w: Verb) => verb === w && on
  return L([
    `export interface ${N.T} {`,
    `  id: string`,
    `  teamId: string`,
    `  name: string`,
    `  createdAt: string`,
    `}`,
    v("types") && ``,
    v("types") && `export interface ${N.T}List {`,
    v("types") && `  items: ${N.T}[]`,
    v("types") && `}`,
    v("paginate") && ``,
    v("paginate") && `export interface Page<A> {`,
    v("paginate") && `  items: A[]`,
    v("paginate") && `  next: string | undefined`,
    v("paginate") && `}`,
    v("validate") && ``,
    v("validate") && `export const MAX_NAME_LENGTH = 200`,
    v("validate") && `export const is${N.T}Input = (x: unknown): x is Pick<${N.T}, "name"> =>`,
    v("validate") && `  typeof x === "object" && x !== null && typeof (x as { name?: unknown }).name === "string" && (x as { name: string }).name.length <= MAX_NAME_LENGTH`,
    v("retries") && ``,
    v("retries") && `export class RetryExhausted extends Error {`,
    v("retries") && `  override readonly name = "RetryExhausted"`,
    v("retries") && `}`,
    verb === "timeouts" && ``,
    verb === "timeouts" && `export const QUERY_TIMEOUT_MS = ${on ? k.timeout : "30_000"}`,
    v("cache") && ``,
    v("cache") && `export const cacheKey = (teamId: string) => \`${N.ts}:\${teamId}\``,
    v("metrics") && ``,
    v("metrics") && `export const METRICS = { list: "${N.metric}.list_ms", get: "${N.metric}.get_ms" } as const`,
    v("log") && ``,
    v("log") && `export interface LogContext {`,
    v("log") && `  teamId: string`,
    v("log") && `  requestId: string | undefined`,
    v("log") && `}`,
    v("tests") && ``,
    v("tests") && `export const empty${N.Ts}: ${N.T}[] = []`,
    v("speed") && ``,
    v("speed") && `export type ${N.Ts}ById = ReadonlyMap<string, ${N.T}>`
  ])
}

const config = (N: Names, k: Knobs, verb: Verb, on: boolean): string => {
  const v = (w: Verb) => verb === w && on
  return L([
    `export const config = {`,
    `  region: "auto",`,
    `  queryTimeoutMs: ${v("timeouts") ? k.timeout : "30_000"},`,
    v("retries") && `  retry: { attempts: ${k.attempts}, backoffMs: ${k.backoff} },`,
    v("cache") && `  cacheTtlSeconds: ${k.ttl},`,
    v("paginate") && `  pageSize: ${k.page},`,
    v("metrics") && `  metricsPrefix: "${N.metric}",`,
    `  logLevel: "${v("log") ? "error" : "warn"}",`,
    v("validate") && `  maxNameLength: 200,`,
    v("speed") && `  maxParallelReads: 8,`,
    v("types") && `  strictResponses: true,`,
    v("tests") && `  testTeamId: "team-test",`,
    `} as const`
  ])
}

const META: Record<Verb, { type: GroupType; focus: ReadonlyArray<ReviewFocus>; description: (N: Names) => string; invariant: (N: Names) => string }> = {
  retries: { type: "Fix", focus: ["ErrorHandling", "Correctness"], description: (N) => `Retry failed ${N.ts} reads before returning an error.`, invariant: () => "A retried call never repeats a write." },
  paginate: { type: "Feat", focus: ["ApiContract", "Performance"], description: (N) => `Return ${N.ts} one page at a time with a cursor.`, invariant: (N) => `Walking every page returns each ${N.T} exactly once.` },
  validate: { type: "Fix", focus: ["Security", "Correctness"], description: (N) => `Reject malformed ${N.T} input with a 400 before it reaches a query.`, invariant: () => "No unchecked input reaches a query." },
  cache: { type: "Perf", focus: ["Performance", "DataIntegrity"], description: (N) => `Serve repeated ${N.ts} reads from cache.`, invariant: () => "A write clears every cached copy it makes out of date." },
  metrics: { type: "Feat", focus: ["Compatibility"], description: (N) => `Record latency for ${N.ts} calls.`, invariant: () => "Metric names stay the same for existing dashboards." },
  timeouts: { type: "Fix", focus: ["ErrorHandling", "Performance"], description: (N) => `Cut the ${N.ts} query timeout from 30 seconds and return 504.`, invariant: () => "A slow query releases its connection when the timeout fires." },
  types: { type: "Refactor", focus: ["ApiContract", "Compatibility"], description: (N) => `Replace untyped ${N.ts} responses with named types.`, invariant: () => "The JSON on the wire stays the same." },
  tests: { type: "Test", focus: ["Correctness"], description: (N) => `Handle the empty case for ${N.ts} and export the row mapper for tests.`, invariant: () => "An empty team gets an empty list with status 200." },
  log: { type: "Fix", focus: ["ErrorHandling", "Security"], description: (N) => `Log ${N.ts} failures with request IDs, then rethrow.`, invariant: () => "Logs carry IDs and never carry user content." },
  speed: { type: "Perf", focus: ["Performance", "Concurrency"], description: (N) => `Load ${N.ts} in parallel.`, invariant: () => "Results keep the order of the requested IDs." }
}

const NOTE: Record<Kind, Partial<Record<Verb, string>>> = {
  handler: {
    retries: "The detail route returns 503 with Retry-After once retries run out.",
    paginate: "The list route reads cursor and limit and caps limit at 200.",
    validate: "The list route returns 400 for a malformed team ID.",
    cache: "The list route sends a private Cache-Control header.",
    metrics: "The list route runs inside a timing middleware.",
    timeouts: "The detail route returns 504 on a timeout.",
    types: "Both routes declare their response types.",
    tests: "An empty list returns 200 instead of 404.",
    log: "The router logs unhandled errors with the request ID.",
    speed: "The list route loads items and the total at once."
  },
  service: {
    retries: "The list query runs inside withRetry.",
    paginate: "The list query takes a cursor and returns the next one.",
    validate: "The list function checks the team ID before querying.",
    cache: "The list function reads and fills the cache.",
    metrics: "The list function records its duration.",
    timeouts: "The query timeout drops from 30 seconds.",
    types: "The list function returns typed rows.",
    tests: "The row mapper is exported and the empty case returns early.",
    log: "The list function logs failures with the team ID.",
    speed: `Loading many records uses Promise.all.`
  },
  data: {
    retries: "Adds a RetryExhausted error.",
    paginate: "Adds a Page type.",
    validate: "Adds an input guard with a 200 character name limit.",
    cache: "Adds the cache key helper.",
    metrics: "Adds the metric names.",
    timeouts: "Lowers the shared query timeout.",
    types: "Adds a list response type.",
    tests: "Adds an empty list constant for tests.",
    log: "Adds a log context type.",
    speed: "Adds a lookup map type."
  },
  config: {}
}

export interface Synth {
  readonly changes: ReadonlyArray<Change>
  readonly meta: GroupMeta
  // One summary line per changed file, so each flow group lists only its own files.
  readonly notes: Readonly<Record<string, string>>
}

// One file's contents before and after an agent's change, built by the same templates as
// synthesize. The system map reads imports from these to draw dependencies.
export const synthFile = (agentId: string, group: string, title: string, path: string, files: ReadonlyArray<string>): { readonly before: string; readonly after: string } => {
  const N = names(group)
  const verb = verbOf(title)
  const k = knobs(hash(agentId))
  const svc = files.find((f) => kindOf(f) === "service")
  const dat = files.find((f) => kindOf(f) === "data")
  const svcName = svc === undefined ? "service" : stemOf(svc)
  const dataName = dat === undefined ? "types" : stemOf(dat)
  const kind = kindOf(path)
  const make = (on: boolean) =>
    kind === "handler" ? handler(N, k, verb, on, svcName, dataName)
    : kind === "data" ? data(N, k, verb, on)
    : kind === "config" ? config(N, k, verb, on)
    : service(N, k, verb, on, dataName)
  return { before: make(false), after: make(true) }
}

export const synthesize = (agentId: string, group: string, title: string, files: ReadonlyArray<string>): Synth => {
  const N = names(group)
  const verb = verbOf(title)
  const k = knobs(hash(agentId))
  const svc = files.find((f) => kindOf(f) === "service")
  const dat = files.find((f) => kindOf(f) === "data")
  const svcName = svc === undefined ? "service" : stemOf(svc)
  const dataName = dat === undefined ? "types" : stemOf(dat)
  const changes = files.map((path): Change => {
    const kind = kindOf(path)
    const make = (on: boolean) =>
      kind === "handler" ? handler(N, k, verb, on, svcName, dataName)
      : kind === "data" ? data(N, k, verb, on)
      : kind === "config" ? config(N, k, verb, on)
      : service(N, k, verb, on, dataName)
    return { path, before: make(false), after: make(true) }
  }).filter((c) => c.before !== c.after)
  const m = META[verb]
  const notes: Record<string, string> = {}
  for (const c of changes) {
    const n = NOTE[kindOf(c.path)][verb]
    if (n !== undefined) notes[c.path] = n
  }
  return {
    changes,
    meta: { type: m.type, description: m.description(N), invariant: m.invariant(N), focus: m.focus, summary: [] },
    notes
  }
}
