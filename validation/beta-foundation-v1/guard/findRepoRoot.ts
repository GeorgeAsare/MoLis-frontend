// VALIDATION ONLY — never import from application code
//
// Walks upward from startPath until a directory is found that contains all three
// markers: package.json, migrations/, and validation/beta-foundation-v1/.
// Replaces fragile hard-coded relative traversals (e.g. '../../../../..') that
// produce the wrong directory when the caller is at an unexpected depth.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const MAX_LEVELS = 10

export function findRepoRoot(startPath: string): string {
  let current = startPath
  for (let i = 0; i < MAX_LEVELS; i++) {
    if (
      existsSync(resolve(current, 'package.json')) &&
      existsSync(resolve(current, 'migrations')) &&
      existsSync(resolve(current, 'validation', 'beta-foundation-v1'))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  throw new Error(
    `findRepoRoot: could not find repository root from "${startPath}". ` +
    `Searched ${MAX_LEVELS} directory levels upward. ` +
    `Expected a directory containing package.json, migrations/, and validation/beta-foundation-v1/.`,
  )
}
