// Line diff for the review panel. Diffcore's desktop app hands Monaco the old and new
// contents of a file; this module turns the same pair into hunks without an editor.

export interface DiffLine {
  readonly kind: "eq" | "del" | "add"
  readonly text: string
  readonly a: number | undefined // line number in the old file, from 1
  readonly b: number | undefined // line number in the new file, from 1
}

export interface Hunk {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: ReadonlyArray<DiffLine>
}

export interface FileDiff {
  readonly hunks: ReadonlyArray<Hunk>
  readonly additions: number
  readonly deletions: number
}

const split = (s: string) => (s === "" ? [] : s.replace(/\n$/, "").split("\n"))

// Longest common subsequence over lines. Files above the cell limit fall back to a
// whole-file replacement so a huge generated file never blocks the page.
const LIMIT = 4_000_000

export const diffLines = (oldText: string, newText: string): ReadonlyArray<DiffLine> => {
  const A = split(oldText)
  const B = split(newText)
  const n = A.length
  const m = B.length
  const out: Array<DiffLine> = []
  if (n * m > LIMIT) {
    A.forEach((t, i) => out.push({ kind: "del", text: t, a: i + 1, b: undefined }))
    B.forEach((t, j) => out.push({ kind: "add", text: t, a: undefined, b: j + 1 }))
    return out
  }
  const w = m + 1
  const L = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1]! + 1 : Math.max(L[(i + 1) * w + j]!, L[i * w + j + 1]!)
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ kind: "eq", text: A[i]!, a: i + 1, b: j + 1 })
      i++
      j++
    } else if (L[(i + 1) * w + j]! >= L[i * w + j + 1]!) {
      out.push({ kind: "del", text: A[i]!, a: i + 1, b: undefined })
      i++
    } else {
      out.push({ kind: "add", text: B[j]!, a: undefined, b: j + 1 })
      j++
    }
  }
  for (; i < n; i++) out.push({ kind: "del", text: A[i]!, a: i + 1, b: undefined })
  for (; j < m; j++) out.push({ kind: "add", text: B[j]!, a: undefined, b: j + 1 })
  return out
}

// Groups changed lines into hunks with `context` unchanged lines on each side.
export const fileDiff = (oldText: string, newText: string, context = 3): FileDiff => {
  const lines = diffLines(oldText, newText)
  const hunks: Array<Hunk> = []
  let additions = 0
  let deletions = 0
  const changed: Array<number> = []
  lines.forEach((l, k) => {
    if (l.kind === "add") additions++
    if (l.kind === "del") deletions++
    if (l.kind !== "eq") changed.push(k)
  })
  let k = 0
  while (k < changed.length) {
    const start = Math.max(0, changed[k]! - context)
    let end = Math.min(lines.length - 1, changed[k]! + context)
    while (k + 1 < changed.length && changed[k + 1]! - context <= end + 1) {
      k++
      end = Math.min(lines.length - 1, changed[k]! + context)
    }
    const body = lines.slice(start, end + 1)
    const firstA = body.find((l) => l.a !== undefined)?.a
    const firstB = body.find((l) => l.b !== undefined)?.b
    hunks.push({
      oldStart: firstA ?? 0,
      oldLines: body.filter((l) => l.kind !== "add").length,
      newStart: firstB ?? 0,
      newLines: body.filter((l) => l.kind !== "del").length,
      lines: body
    })
    k++
  }
  return { hunks, additions, deletions }
}

// Pairs deletions with the additions that follow them, for a side-by-side view.
export interface Row {
  readonly left: DiffLine | undefined
  readonly right: DiffLine | undefined
}

export const sideBySide = (lines: ReadonlyArray<DiffLine>): ReadonlyArray<Row> => {
  const rows: Array<Row> = []
  let k = 0
  while (k < lines.length) {
    const l = lines[k]!
    if (l.kind === "eq") {
      rows.push({ left: l, right: l })
      k++
      continue
    }
    const dels: Array<DiffLine> = []
    const adds: Array<DiffLine> = []
    while (k < lines.length && lines[k]!.kind === "del") dels.push(lines[k++]!)
    while (k < lines.length && lines[k]!.kind === "add") adds.push(lines[k++]!)
    for (let r = 0; r < Math.max(dels.length, adds.length); r++) rows.push({ left: dels[r], right: adds[r] })
  }
  return rows
}
