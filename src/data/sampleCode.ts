import type { Change, GroupMeta } from "../domain/Analyze.ts"

// SAMPLE DATA. File contents behind the two 3-agent scripts in sampleRuns.ts. Each
// branch matches the files its commits list. The live feed replaces these with
// contents read from each agent's branch; see FILLER_ITEMS.md. Keys are the task IDs
// and agent IDs that sampleRuns.ts uses.

const lines = (...xs: ReadonlyArray<string>) => xs.join("\n") + "\n"

// Shared files on main before the upload run

const UPLOAD_MAIN = lines(
  `import { Hono } from "hono"`,
  `import type { Env } from "../env"`,
  `import { storeUpload } from "../storage"`,
  ``,
  `export const upload = new Hono<{ Bindings: Env }>()`,
  ``,
  `upload.post("/api/upload", async (c) => {`,
  `  const user = c.get("user")`,
  `  const body = await c.req.parseBody()`,
  `  const file = body["file"]`,
  `  if (!(file instanceof File)) {`,
  `    return c.json({ error: "missing_file" }, 400)`,
  `  }`,
  `  const key = await storeUpload(c.env.UPLOADS, user.id, file)`,
  `  return c.json({ key }, 201)`,
  `})`
)

const WRANGLER_MAIN = lines(
  `{`,
  `  "name": "acme-api",`,
  `  "main": "src/index.ts",`,
  `  "compatibility_date": "2026-09-01",`,
  `  "r2_buckets": [`,
  `    { "binding": "UPLOADS", "bucket_name": "acme-uploads" }`,
  `  ],`,
  `  "kv_namespaces": [`,
  `    { "binding": "SESSIONS", "id": "<sessions-namespace-id>" }`,
  `  ]`,
  `}`
)

// Agent A: a Durable Object counts uploads per user.
const A_LIMITER = lines(
  `import { DurableObject } from "cloudflare:workers"`,
  ``,
  `const WINDOW_MS = 60_000`,
  `const LIMIT = 60`,
  ``,
  `// One instance per user. Storage keeps the timestamps of recent uploads.`,
  `export class RateLimiter extends DurableObject {`,
  `  async take(now: number): Promise<{ ok: boolean; retryAfter: number }> {`,
  `    const recent = ((await this.ctx.storage.get<number[]>("hits")) ?? []).filter((t) => now - t < WINDOW_MS)`,
  `    if (recent.length >= LIMIT) {`,
  `      const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000)`,
  `      return { ok: false, retryAfter }`,
  `    }`,
  `    recent.push(now)`,
  `    await this.ctx.storage.put("hits", recent)`,
  `    return { ok: true, retryAfter: 0 }`,
  `  }`,
  `}`
)

const A_WRANGLER = WRANGLER_MAIN.replace(
  `  "kv_namespaces": [`,
  [
    `  "durable_objects": {`,
    `    "bindings": [{ "name": "RATE_LIMITER", "class_name": "RateLimiter" }]`,
    `  },`,
    `  "migrations": [{ "tag": "v4", "new_sqlite_classes": ["RateLimiter"] }],`,
    `  "kv_namespaces": [`
  ].join("\n")
)

const A_UPLOAD = UPLOAD_MAIN
  .replace(`import { storeUpload } from "../storage"`, `import { storeUpload } from "../storage"\nimport type { RateLimiter } from "../limiter"`)
  .replace(
    `  const user = c.get("user")\n`,
    [
      `  const user = c.get("user")`,
      `  const limiter = c.env.RATE_LIMITER.get(c.env.RATE_LIMITER.idFromName(user.id)) as DurableObjectStub<RateLimiter>`,
      `  const { ok, retryAfter } = await limiter.take(Date.now())`,
      `  if (!ok) {`,
      `    c.header("Retry-After", String(retryAfter))`,
      `    return c.json({ error: "rate_limited" }, 429)`,
      `  }`,
      ``
    ].join("\n")
  )

// Agent B: a per-minute counter in Workers KV.
const B_COUNTER = lines(
  `// Counts requests per user per minute in KV. Keys expire after two minutes.`,
  `export const countThisMinute = async (kv: KVNamespace, userId: string, now: number): Promise<number> => {`,
  `  const key = \`upload:\${userId}:\${Math.floor(now / 60_000)}\``,
  `  const current = Number((await kv.get(key)) ?? "0") + 1`,
  `  await kv.put(key, String(current), { expirationTtl: 120 })`,
  `  return current`,
  `}`
)

const B_UPLOAD = UPLOAD_MAIN
  .replace(`import { storeUpload } from "../storage"`, `import { storeUpload } from "../storage"\nimport { countThisMinute } from "../kv-counter"`)
  .replace(
    `  const user = c.get("user")\n`,
    [
      `  const user = c.get("user")`,
      `  if ((await countThisMinute(c.env.SESSIONS, user.id, Date.now())) > 60) {`,
      `    return c.json({ error: "rate_limited" }, 429)`,
      `  }`,
      ``
    ].join("\n")
  )

// Agent C: the Workers rate limiting binding, no new storage.
const C_WRANGLER = WRANGLER_MAIN.replace(
  `  "kv_namespaces": [`,
  [
    `  "ratelimits": [`,
    `    { "name": "UPLOAD_LIMITER", "namespace_id": "1001", "simple": { "limit": 60, "period": 60 } }`,
    `  ],`,
    `  "kv_namespaces": [`
  ].join("\n")
)

const C_UPLOAD = UPLOAD_MAIN.replace(
  `  const user = c.get("user")\n`,
  [
    `  const user = c.get("user")`,
    `  const { success } = await c.env.UPLOAD_LIMITER.limit({ key: user.id })`,
    `  if (!success) {`,
    `    c.header("Retry-After", "60")`,
    `    return c.json({ error: "rate_limited" }, 429)`,
    `  }`,
    ``
  ].join("\n")
)

const C_TEST = lines(
  `import { SELF } from "cloudflare:test"`,
  `import { describe, expect, it } from "vitest"`,
  ``,
  `const send = () => {`,
  `  const form = new FormData()`,
  `  form.set("file", new File(["x"], "x.txt"))`,
  `  return SELF.fetch("https://acme.test/api/upload", { method: "POST", body: form, headers: { authorization: "Bearer test-user" } })`,
  `}`,
  ``,
  `describe("POST /api/upload rate limit", () => {`,
  `  it("returns 429 on the 61st upload in a minute", async () => {`,
  `    for (let i = 0; i < 60; i++) expect((await send()).status).toBe(201)`,
  `    const res = await send()`,
  `    expect(res.status).toBe(429)`,
  `    expect(res.headers.get("retry-after")).toBe("60")`,
  `  })`,
  ``,
  `  it("keeps the 400 for a missing file", async () => {`,
  `    const res = await SELF.fetch("https://acme.test/api/upload", { method: "POST", body: new FormData(), headers: { authorization: "Bearer test-user" } })`,
  `    expect(res.status).toBe(400)`,
  `  })`,
  `})`
)

// Shared files on main before the invites run

const MEMBER_MAIN = lines(
  `export interface Member {`,
  `  id: string`,
  `  teamId: string`,
  `  name: string`,
  `  email: string`,
  `  role: string`,
  `}`
)

const MEMBER_B = lines(
  `export type MemberRole = "owner" | "editor" | "viewer"`,
  ``,
  `export interface Member {`,
  `  id: string`,
  `  teamId: string`,
  `  name: string`,
  `  email: string`,
  `  role: MemberRole`,
  `}`
)

// C rebased onto B, so its branch carries B's MemberRole as well.
const MEMBER_C = MEMBER_B + lines(
  ``,
  `export interface PendingInvite {`,
  `  id: string`,
  `  teamId: string`,
  `  role: MemberRole`,
  `  invitedByName: string`,
  `  expiresAt: string`,
  `}`
)

const SIGN_A = lines(
  `const encoder = new TextEncoder()`,
  ``,
  `const key = (secret: string) =>`,
  `  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])`,
  ``,
  `const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")`,
  ``,
  `// Signs "<inviteId>.<expiresAt>" so a link cannot be edited to extend its expiry.`,
  `export const signInvite = async (secret: string, inviteId: string, expiresAt: number): Promise<string> => {`,
  `  const payload = \`\${inviteId}.\${expiresAt}\``,
  `  const mac = await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload))`,
  `  return \`\${payload}.\${toHex(mac)}\``,
  `}`,
  ``,
  `export const verifyInvite = async (secret: string, token: string, now: number): Promise<string | undefined> => {`,
  `  const [inviteId, expiresAt, mac] = token.split(".")`,
  `  if (!inviteId || !expiresAt || !mac || Number(expiresAt) < now) return undefined`,
  `  const expected = await signInvite(secret, inviteId, Number(expiresAt))`,
  `  return expected.endsWith(mac) ? inviteId : undefined`,
  `}`
)

const INVITES_A = lines(
  `import { Hono } from "hono"`,
  `import type { Env } from "../env"`,
  `import { signInvite, verifyInvite } from "../lib/sign"`,
  `import type { MemberRole } from "../types/member"`,
  ``,
  `const WEEK_MS = 7 * 24 * 60 * 60 * 1000`,
  ``,
  `export const invites = new Hono<{ Bindings: Env }>()`,
  ``,
  `invites.post("/api/invites", async (c) => {`,
  `  const { teamId, email, role } = await c.req.json<{ teamId: string; email: string; role: MemberRole }>()`,
  `  if (role === "owner") return c.json({ error: "owner_invites_not_allowed" }, 400)`,
  `  const id = crypto.randomUUID()`,
  `  const expiresAt = Date.now() + WEEK_MS`,
  `  await c.env.DB.prepare("insert into invites (id, team_id, email, role, invited_by, expires_at) values (?, ?, ?, ?, ?, ?)")`,
  `    .bind(id, teamId, email, role, c.get("user").id, expiresAt)`,
  `    .run()`,
  `  const token = await signInvite(c.env.INVITE_SECRET, id, expiresAt)`,
  `  return c.json({ id, link: \`https://acme.test/join/\${token}\`, expiresAt }, 201)`,
  `})`,
  ``,
  `invites.get("/api/invites/:token", async (c) => {`,
  `  const id = await verifyInvite(c.env.INVITE_SECRET, c.req.param("token"), Date.now())`,
  `  if (id === undefined) return c.json({ error: "invite_expired" }, 410)`,
  `  return c.json({ id })`,
  `})`
)

const MEMBERS_MAIN = lines(
  `import type { Member } from "../types/member"`,
  ``,
  `export function MembersPage({ members }: { members: Member[] }) {`,
  `  return (`,
  `    <section>`,
  `      <h1>Members</h1>`,
  `      <ul>`,
  `        {members.map((m) => (`,
  `          <li key={m.id}>`,
  `            {m.name} <span className="role">{m.role}</span>`,
  `          </li>`,
  `        ))}`,
  `      </ul>`,
  `    </section>`,
  `  )`,
  `}`
)

const MEMBERS_C = lines(
  `import type { Member, MemberRole, PendingInvite } from "../types/member"`,
  ``,
  `const roleLabel: Record<MemberRole, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" }`,
  `const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })`,
  ``,
  `export function MembersPage({ members, invites, canInvite }: { members: Member[]; invites: PendingInvite[]; canInvite: boolean }) {`,
  `  return (`,
  `    <section>`,
  `      <h1>Members</h1>`,
  `      <ul>`,
  `        {members.map((m) => (`,
  `          <li key={m.id}>`,
  `            {m.name} <span className="role">{roleLabel[m.role]}</span>`,
  `          </li>`,
  `        ))}`,
  `      </ul>`,
  `      {canInvite && invites.length > 0 && (`,
  `        <>`,
  `          <h2>Pending invites</h2>`,
  `          <ul>`,
  `            {invites.map((i) => (`,
  `              <li key={i.id}>`,
  `                {roleLabel[i.role]}, invited by {i.invitedByName}, expires {day.format(new Date(i.expiresAt))}`,
  `              </li>`,
  `            ))}`,
  `          </ul>`,
  `        </>`,
  `      )}`,
  `    </section>`,
  `  )`,
  `}`
)

const ch = (path: string, before: string, after: string): Change => ({ path, before, after })

// Branch contents per sample task and agent, measured against main.
export const SAMPLE_BRANCHES: Readonly<Record<string, Readonly<Record<string, ReadonlyArray<Change>>>>> = {
  "t-upload-limit": {
    A: [ch("src/routes/upload.ts", UPLOAD_MAIN, A_UPLOAD), ch("src/limiter.ts", "", A_LIMITER), ch("wrangler.jsonc", WRANGLER_MAIN, A_WRANGLER)],
    B: [ch("src/routes/upload.ts", UPLOAD_MAIN, B_UPLOAD), ch("src/kv-counter.ts", "", B_COUNTER)],
    C: [ch("src/routes/upload.ts", UPLOAD_MAIN, C_UPLOAD), ch("test/upload.test.ts", "", C_TEST), ch("wrangler.jsonc", WRANGLER_MAIN, C_WRANGLER)]
  },
  "t-team-invites": {
    D: [ch("src/routes/invites.ts", "", INVITES_A), ch("src/lib/sign.ts", "", SIGN_A)],
    E: [ch("src/types/member.ts", MEMBER_MAIN, MEMBER_B)],
    F: [ch("src/pages/members.tsx", MEMBERS_MAIN, MEMBERS_C), ch("src/types/member.ts", MEMBER_MAIN, MEMBER_C)]
  }
}

// Review metadata as Diffcore's metadata pass would attach it to each flow group.
export const SAMPLE_META: Readonly<Record<string, Readonly<Record<string, GroupMeta>>>> = {
  "t-upload-limit": {
    A: {
      type: "Feat",
      description: "Count uploads per user in a RateLimiter Durable Object and return 429 past 60 a minute.",
      invariant: "Two uploads that arrive at once in different locations never both take the 60th slot.",
      focus: ["Concurrency", "ApiContract"],
      summary: ["Adds a RateLimiter Durable Object that stores recent upload times per user.", "The upload route asks the limiter first and returns 429 with Retry-After."]
    },
    B: {
      type: "Feat",
      description: "Count uploads per user in a KV key per minute and return 429 past 60.",
      invariant: "A burst of uploads in one minute never passes the limit.",
      focus: ["Concurrency", "Correctness"],
      summary: ["Adds a KV counter keyed by user and minute.", "The upload route rejects the request once the count passes 60."]
    },
    C: {
      type: "Feat",
      description: "Use the Workers rate limiting binding to return 429 past 60 uploads a minute.",
      invariant: "Uploads under the limit keep their 201 and 400 responses unchanged.",
      focus: ["ApiContract", "Correctness"],
      summary: ["Binds UPLOAD_LIMITER with a limit of 60 per 60 seconds.", "The upload route checks the binding first and returns 429 with Retry-After: 60."]
    }
  },
  "t-team-invites": {
    D: {
      type: "Feat",
      description: "Create invites with a signed link that expires after 7 days.",
      invariant: "Nobody can extend or forge an invite link without the secret.",
      focus: ["Security", "ApiContract"],
      summary: ["POST /api/invites stores the invite and returns a signed link.", "GET /api/invites/:token returns 410 once the link expires.", "Owners cannot be invited, only editors and viewers."]
    },
    E: {
      type: "Refactor",
      description: "Replace the free-text member role with a MemberRole type.",
      invariant: "Every role stored today is one of owner, editor, or viewer.",
      focus: ["DataIntegrity", "Compatibility"],
      summary: ["Adds MemberRole and uses it on Member."]
    },
    F: {
      type: "Feat",
      description: "List pending invites with role and expiry on the Members page.",
      invariant: "Pending invites show the inviter's name and never an email address.",
      focus: ["Security", "Correctness"],
      summary: ["Adds PendingInvite to the member types.", "Members page shows pending invites to people who can invite."]
    }
  }
}
