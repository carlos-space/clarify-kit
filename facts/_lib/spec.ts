// Shared by the facts of the clarify-kit spec: the tool name every id starts with and the source every fact has.
// The spec is written by clarify-kit itself, so every fact is `published`.
// A new fact writes `history({ since: 'next', value })` in its own file, with `pending: '<task>'` while the code is not
// in the repository. Do not wrap it in a helper here: `fact-kit pin` rewrites only the `since: 'next'` literals it
// finds in the files under the facts directory and does not read `_lib`, so a wrapped `next` would never be pinned.
import { factsOf } from 'fact-kit'
import type { FactsFactory } from 'fact-kit'

export const TOOL = 'clarify-kit'

export function specFacts(topics: readonly string[], prefix?: string): FactsFactory {
  return factsOf({ tool: TOOL, source: { kind: 'published' }, topics, ...(prefix === undefined ? {} : { prefix }) })
}
