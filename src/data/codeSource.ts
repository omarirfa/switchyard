import type { ContentSource } from "../domain/CodeGraph.ts"
import { SAMPLE_BRANCHES } from "./sampleCode.ts"
import { synthFile } from "./synthCode.ts"

// SAMPLE DATA. File contents for the system map: the hand-written code for the two
// scripted tasks, and the generated code for simulated agents. A live Worker reads
// the same before and after contents from each agent's Artifacts branch.
export const codeSource: ContentSource = (ctx) => {
  const scripted = SAMPLE_BRANCHES[ctx.taskId]
  if (scripted !== undefined) {
    const c = scripted[ctx.agentId]?.find((x) => x.path === ctx.path)
    return c === undefined ? undefined : { before: c.before, after: c.after }
  }
  return synthFile(ctx.agentId, ctx.group, ctx.title, ctx.path, ctx.files)
}
