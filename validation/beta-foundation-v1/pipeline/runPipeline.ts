// VALIDATION ONLY — never import from application code
//
// Runs an ordered sequence of pipeline stages. Each stage is an async function.
// Stages execute sequentially; if any stage throws, execution stops immediately
// and the error propagates to the caller unchanged.
//
// Exporting runPipeline as a named function (rather than inlining the for-loop
// in runValidation.ts) makes Stage 3 propagation unit-testable without a
// database.

export async function runPipeline(
  stages: Array<() => Promise<void>>,
): Promise<void> {
  for (const stage of stages) {
    await stage()
  }
}
