// Product areas group workstreams for the system map, the timeline, review ownership,
// and earned autonomy. SAMPLE DATA: the area names, their members, and the map edges
// describe an example product. A live deployment reads them from the repo's config.

export const AREAS = ["accounts", "billing", "content", "messaging", "platform", "data", "developer", "ops"] as const
export type Area = typeof AREAS[number]

export const areaLabel: Record<Area, string> = {
  accounts: "Accounts",
  billing: "Billing",
  content: "Content",
  messaging: "Messaging",
  platform: "Platform",
  data: "Data",
  developer: "Developer tools",
  ops: "Operations"
}

const MEMBERS: Record<Area, ReadonlyArray<string>> = {
  accounts: ["auth", "sso", "sessions", "permissions", "teams", "invites", "onboarding", "settings"],
  billing: ["billing", "payments", "pricing"],
  content: ["media", "comments", "uploads", "search", "imports", "exports"],
  messaging: ["notifications", "emails", "webhooks"],
  platform: ["api-gateway", "rate-limits", "cache", "queues", "scheduler", "feature-flags"],
  data: ["analytics", "reports", "audit-log", "backups", "migrations"],
  developer: ["cli", "sdk-js", "sdk-python", "docs-site", "mobile-api"],
  ops: ["observability", "status-page", "admin", "i18n"]
}

const BY_GROUP = new Map<string, Area>()
for (const a of AREAS) for (const g of MEMBERS[a]) BY_GROUP.set(g, a)

export const areaOf = (group: string): Area => BY_GROUP.get(group) ?? "platform"
export const groupsOf = (area: Area): ReadonlyArray<string> => MEMBERS[area]

// Workstreams where an owner approves every contract and every merge decision.
export const HIGH_RISK_GROUPS: ReadonlySet<string> = new Set(["auth", "sso", "permissions", "payments", "billing", "migrations"])
export const isHighRisk = (group: string) => HIGH_RISK_GROUPS.has(group)

// Example owner roles. The preview names roles, never people.
export const ownerOf = (area: Area) => `${areaLabel[area]} owner`

// Sample attention budget per owner per day.
export const DAILY_DECISION_LIMIT = 20
