import { fileDiff } from "./LineDiff.ts"
import type {
  AnalysisOutput,
  EntrypointType,
  FileChange,
  FileDiffContent,
  FileRole,
  FlowEdge,
  FlowGroup,
  GroupType,
  ImpactScope,
  InfrastructureGroup,
  ReviewComplexity,
  ReviewFocus,
  Risk
} from "./Review.ts"

// A browser-side stand-in for Diffcore's deterministic path: role detection, import
// edges, forward reachability from entrypoints, risk score, and review order. It
// produces the same AnalysisOutput shape, so a live feed can send Diffcore's own
// output in its place. Review metadata (type, description, invariant, focus, summary)
// comes from the caller, as it would from Diffcore's metadata pass.

export interface Change {
  readonly path: string
  readonly before: string
  readonly after: string
}

export interface GroupMeta {
  readonly type: GroupType
  readonly description: string
  readonly invariant: string
  readonly focus: ReadonlyArray<ReviewFocus>
  readonly summary: ReadonlyArray<string>
}

export interface AnalyzeInput {
  readonly diffType: "BranchComparison" | "CommitRange"
  readonly base: string
  readonly head: string
  readonly headSha: string | null
  readonly changes: ReadonlyArray<Change>
  readonly highRisk: boolean
  // Metadata for the flow group that holds these files, if any.
  readonly meta: (files: ReadonlyArray<string>) => GroupMeta | undefined
}

const ROLE_RANK: Record<FileRole, number> = {
  Entrypoint: 0, Handler: 1, Service: 2, Repository: 3, Model: 4, Utility: 5, Config: 6, Infrastructure: 7, Test: 8
}

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1)
const dir = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf("/")))
const stem = (p: string) => base(p).replace(/\.(test\.)?[a-z]+$/, "")

export const roleOf = (path: string): FileRole => {
  const b = base(path)
  if (/\.test\.|\.spec\.|^test\//.test(path) || path.startsWith("test/")) return "Test"
  if (/^(wrangler\.jsonc?|package\.json|tsconfig\.json)$/.test(b) || b === "config.ts") return "Config"
  if (/\/(pages|routes)\//.test(path) || /^(routes|api)\.ts$/.test(b)) return "Entrypoint"
  if (/^(handlers|views|index)\.ts$/.test(b)) return "Handler"
  if (/^(store|cache|client)\.ts$/.test(b)) return "Repository"
  if (/^(schema|types|models|validate)\.ts$/.test(b) || /\/types\//.test(path)) return "Model"
  if (/^(utils|errors|metrics|policy|sign)\.ts$/.test(b) || /\/lib\//.test(path)) return "Utility"
  return "Service"
}

const entryTypeOf = (path: string, content: string): EntrypointType | undefined => {
  if (path.endsWith(".tsx")) return "ReactPage"
  if (/\.(get|post|put|patch|delete)\("/.test(content)) return "HttpRoute"
  if (/^(jobs|queue|worker)\.ts$/.test(base(path))) return "QueueConsumer"
  return undefined
}

const routeSymbol = (content: string): string | undefined => {
  const m = /\.(get|post|put|patch|delete)\("(\/[^"]*)"/.exec(content)
  return m === null ? undefined : `${m[1]!.toUpperCase()} ${m[2]}`
}

// Relative imports that point at another changed file.
const importsOf = (path: string, content: string, paths: ReadonlySet<string>): Array<string> => {
  const out: Array<string> = []
  for (const m of content.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
    const parts = dir(path).split("/").filter(Boolean)
    for (const seg of m[1]!.split("/")) {
      if (seg === "..") parts.pop()
      else if (seg !== ".") parts.push(seg)
    }
    const target = parts.join("/")
    for (const cand of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
      if (paths.has(cand) && cand !== path) {
        out.push(cand)
        break
      }
    }
  }
  return out
}

const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s+([A-Za-z_$][\w$]*)/

// Names declared on changed lines, or the declaration that encloses the first change.
const symbolsOf = (c: Change): Array<string> => {
  const d = fileDiff(c.before, c.after, 0)
  const names = new Set<string>()
  const after = c.after.split("\n")
  for (const h of d.hunks) {
    for (const l of h.lines) {
      const m = DECL.exec(l.text)
      if (m !== null && l.kind !== "eq") names.add(m[1]!)
    }
    if (names.size === 0 && h.newStart > 0) {
      for (let i = h.newStart - 1; i >= 0; i--) {
        const m = DECL.exec(after[i] ?? "")
        if (m !== null) {
          names.add(m[1]!)
          break
        }
      }
    }
    const r = routeSymbol(h.lines.map((l) => l.text).join("\n"))
    if (r !== undefined) names.add(r)
  }
  return [...names].slice(0, 6)
}

const riskBand = (s: number): Risk => (s < 0.3 ? "Low" : s < 0.55 ? "Medium" : s < 0.8 ? "High" : "Critical")
const impactOf = (files: ReadonlyArray<string>): ImpactScope => {
  const dirs = new Set(files.map(dir)).size
  return dirs <= 1 ? "Local" : dirs === 2 ? "Module" : "CrossCutting"
}
const complexityOf = (churn: number): ReviewComplexity => (churn < 15 ? "Trivial" : churn < 50 ? "Simple" : churn < 120 ? "Moderate" : "Complex")

const languageOf = (p: string) => (p.endsWith(".tsx") ? "tsx" : p.endsWith(".ts") ? "typescript" : p.endsWith(".jsonc") || p.endsWith(".json") ? "json" : "plaintext")

export const analyze = (input: AnalyzeInput): { readonly analysis: AnalysisOutput; readonly files: ReadonlyArray<FileDiffContent> } => {
  const byPath = new Map(input.changes.map((c) => [c.path, c]))
  const paths = new Set(byPath.keys())
  const stats = new Map(input.changes.map((c) => {
    const d = fileDiff(c.before, c.after)
    return [c.path, { additions: d.additions, deletions: d.deletions }]
  }))
  const roles = new Map(input.changes.map((c) => [c.path, roleOf(c.path)]))
  const imports = new Map(input.changes.map((c) => [c.path, importsOf(c.path, c.after, paths)]))

  const infra = input.changes.filter((c) => roles.get(c.path) === "Config").map((c) => c.path)
  const tests = input.changes.filter((c) => roles.get(c.path) === "Test").map((c) => c.path)
  const code = input.changes.filter((c) => !infra.includes(c.path) && !tests.includes(c.path)).map((c) => c.path)
    .sort((a, b) => ROLE_RANK[roles.get(a)!] - ROLE_RANK[roles.get(b)!] || a.localeCompare(b))

  interface Draft { readonly name: string; readonly entry: FlowGroup["entrypoint"]; readonly files: Array<{ path: string; depth: number }> }
  const drafts: Array<Draft> = []
  const taken = new Set<string>()

  // Forward reachability over import edges from each entrypoint, as Diffcore clusters.
  for (const p of code) {
    const content = byPath.get(p)!.after
    const type = entryTypeOf(p, content)
    if (type === undefined || taken.has(p)) continue
    const files: Array<{ path: string; depth: number }> = []
    const queue: Array<{ path: string; depth: number }> = [{ path: p, depth: 0 }]
    while (queue.length > 0) {
      const cur = queue.shift()!
      if (taken.has(cur.path)) continue
      taken.add(cur.path)
      files.push(cur)
      for (const next of imports.get(cur.path) ?? []) if (code.includes(next) && !taken.has(next)) queue.push({ path: next, depth: cur.depth + 1 })
    }
    const symbol = type === "HttpRoute" ? routeSymbol(content) ?? stem(p) : type === "ReactPage" ? (DECL.exec(content.split("\n").find((l) => /export (default )?function/.test(l)) ?? "")?.[1] ?? stem(p)) : stem(p)
    const name = type === "HttpRoute" ? symbol : type === "ReactPage" ? `${stem(p)[0]!.toUpperCase()}${stem(p).slice(1)} page` : `${stem(p)} consumer`
    drafts.push({ name, entry: { file: p, symbol, entrypoint_type: type }, files })
  }
  // Changed code no entrypoint reaches: one group per directory, read in role order.
  const rest = new Map<string, Array<string>>()
  for (const p of code) if (!taken.has(p)) rest.set(dir(p), [...(rest.get(dir(p)) ?? []), p])
  for (const [d, files] of rest) drafts.push({ name: `Changes in ${d}`, entry: null, files: files.map((p, i) => ({ path: p, depth: i })) })
  if (tests.length > 0) {
    drafts.push({ name: tests.length === 1 ? `Tests in ${base(tests[0]!)}` : "Tests", entry: { file: tests[0]!, symbol: stem(tests[0]!), entrypoint_type: "TestFile" }, files: tests.map((p, i) => ({ path: p, depth: i })) })
  }

  // Two route files can serve the same path in a split merge; keep names distinct.
  const seen = new Map<string, number>()
  for (const g of drafts) seen.set(g.name, (seen.get(g.name) ?? 0) + 1)
  const label = (g: Draft) => ((seen.get(g.name) ?? 0) > 1 && g.entry !== null ? `${g.name} in ${base(g.entry.file)}` : g.name)

  const groups: Array<FlowGroup> = drafts.map((g, i) => {
    const files: Array<FileChange> = g.files
      .slice()
      .sort((a, b) => a.depth - b.depth || ROLE_RANK[roles.get(a.path)!] - ROLE_RANK[roles.get(b.path)!])
      .map((f, k) => ({
        path: f.path,
        flow_position: k,
        role: roles.get(f.path)!,
        changes: stats.get(f.path)!,
        symbols_changed: symbolsOf(byPath.get(f.path)!)
      }))
    const inGroup = new Set(files.map((f) => f.path))
    const edges: Array<FlowEdge> = files.flatMap((f) =>
      (imports.get(f.path) ?? []).filter((t) => inGroup.has(t)).map((t): FlowEdge => ({ from: f.path, to: t, edge_type: roles.get(t) === "Model" ? "Imports" : "Calls" }))
    )
    const churn = files.reduce((s, f) => s + f.changes.additions + f.changes.deletions, 0)
    const isTest = g.entry?.entrypoint_type === "TestFile"
    const score = Math.min(0.97, isTest
      ? 0.12 + Math.min(0.1, churn / 400)
      : 0.16 + 0.08 * Math.min(files.length, 4) + Math.min(0.22, churn / 220) + (input.highRisk ? 0.3 : 0) + (g.entry?.entrypoint_type === "HttpRoute" ? 0.06 : 0))
    const meta = isTest ? undefined : input.meta(files.map((f) => f.path))
    return {
      id: `group_${i + 1}`,
      name: label(g),
      entrypoint: g.entry,
      files,
      edges,
      risk_score: Math.round(score * 100) / 100,
      review_order: 0,
      group_type: isTest ? "Test" : meta?.type ?? null,
      description: isTest ? `Tests that cover ${drafts.find((d) => d.entry?.entrypoint_type !== "TestFile")?.name ?? "this change"}.` : meta?.description ?? null,
      risk: riskBand(score),
      impact: impactOf(files.map((f) => f.path)),
      complexity: complexityOf(churn),
      review_focus: meta?.focus.slice(0, 3) ?? [],
      summary: meta?.summary.slice(0, 5) ?? [],
      invariant: meta?.invariant ?? null
    }
  })
  // Review order follows the score, highest first, as Diffcore ranks.
  const ranked = groups.slice().sort((a, b) => b.risk_score - a.risk_score)
  const ordered = ranked.map((g, i) => ({ ...g, review_order: i + 1 }))

  const infrastructure: InfrastructureGroup | null = infra.length === 0
    ? null
    : {
      files: infra,
      sub_groups: [{ name: "Configuration", category: "Infrastructure", files: infra }],
      reason: "No entrypoint reaches these files. They configure the Worker that runs the code above."
    }

  const all = input.changes.map((c) => c.path)
  const after = input.changes.map((c) => c.after).join("\n")
  const frameworks = [
    /from "hono"/.test(after) ? "Hono" : "",
    /from "react"|\.tsx/.test(after + all.join(" ")) ? "React" : "",
    /cloudflare:test|vitest/.test(after) ? "Vitest" : "",
    /from "effect"/.test(after) ? "Effect.ts" : "",
    all.some((p) => p.startsWith("wrangler")) ? "Cloudflare Workers" : ""
  ].filter(Boolean)

  return {
    analysis: {
      version: "0.1.0",
      diff_source: {
        diff_type: input.diffType,
        base: input.base,
        head: input.head,
        base_sha: null,
        head_sha: input.headSha
      },
      summary: {
        total_files_changed: all.length,
        total_groups: ordered.length,
        languages_detected: [...new Set(all.map((p) => (p.endsWith(".tsx") || p.endsWith(".ts") ? "TypeScript" : "JSON")))],
        frameworks_detected: frameworks
      },
      groups: ordered,
      infrastructure_group: infrastructure,
      annotations: null
    },
    files: input.changes.map((c) => ({ path: c.path, old_content: c.before, new_content: c.after, language: languageOf(c.path) }))
  }
}
