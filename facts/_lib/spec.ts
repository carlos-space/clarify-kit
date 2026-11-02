// Shared by the facts of the clarify-kit spec: the tool name every id starts with, the source every fact has,
// and the one-row history every new fact starts with.
// The spec is written by clarify-kit itself, so every fact is `published`.
import { factsOf, history } from 'fact-kit'
import type { FactsFactory } from 'fact-kit'

export const TOOL = 'clarify-kit'

/** The pending label of the task that implements a fact. The label is dropped by pin when the row is released. */
export type Pending = 'build-check' | 'pin-read-impact-render'

export function specFacts(topics: readonly string[], prefix?: string): FactsFactory {
  return factsOf({ tool: TOOL, source: { kind: 'published' }, topics, ...(prefix === undefined ? {} : { prefix }) })
}

/** A row that starts at the next release and is visible only to a reader that includes `pending`. */
export function next(pending: Pending, value: unknown) {
  return history({ since: 'next', pending, value })
}

/** A row that starts at the next release and is visible to every reader on head: the code it describes is in the repository. */
export function upcoming(value: unknown) {
  return history({ since: 'next', value })
}
