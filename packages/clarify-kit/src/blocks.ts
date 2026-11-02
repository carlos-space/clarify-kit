// The seven blocks a document body is made of. Each builder checks its fields while the `.doc.ts` is evaluated
// and returns a plain object, so the build can write it to the index as it is. A fact reference may be a fact id or
// a fact object imported from a facts package; both are kept as the id.
import type { Since } from 'fact-kit'
import { setMark } from 'fact-kit'
import { DocModelError } from './errors.ts'
import {
  factIdsOf,
  onlyKeys,
  pendingOf,
  requireArray,
  requireObject,
  requireText,
  sinceOf,
} from './validate.ts'

/** A reference to a fact: its id, or the fact object imported from a facts package. */
export type FactRef = string | { readonly id: string }

/** Every block, and every document, may carry these two. */
export interface Versioned {
  since?: Since
  pending?: string
}

export interface TextBlock extends Versioned {
  kind: 'text'
  text: string
}
export interface ListBlock extends Versioned {
  kind: 'list'
  items: string[]
  ordered?: boolean
}
export interface TableBlock extends Versioned {
  kind: 'table'
  columns: string[]
  rows: string[][]
}
export interface FactBlock extends Versioned {
  kind: 'fact'
  facts: string[]
  renderer?: string
}
export interface ScenarioBlock extends Versioned {
  kind: 'scenario'
  scenario: string
  expected: string
  judgement: string
  facts: string[]
}
export interface CodeBlock extends Versioned {
  kind: 'code'
  lang: string
  code: string
}
export interface AssetBlock extends Versioned {
  kind: 'asset'
  path: string
  alt?: string
}
export type Block = TextBlock | ListBlock | TableBlock | FactBlock | ScenarioBlock | CodeBlock | AssetBlock
export type BlockKind = Block['kind']

/** The fields of each block, as `clarify-kit.blocks.<kind>` lists them. `since` and `pending` come with all of them. */
export const BLOCK_FIELDS = {
  text: ['text'],
  list: ['items', 'ordered'],
  table: ['columns', 'rows'],
  fact: ['facts', 'renderer'],
  scenario: ['scenario', 'expected', 'judgement', 'facts'],
  code: ['lang', 'code'],
  asset: ['path', 'alt'],
} as const satisfies Record<BlockKind, readonly string[]>

export const BLOCK_KINDS = Object.keys(BLOCK_FIELDS) as BlockKind[]

const BLOCK = Symbol.for('clarify-kit.block')

/** True for a block a builder of this package made. */
export const isBlock = (value: unknown): value is Block =>
  typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[BLOCK] === true

function made<T extends Block>(block: T, options: Versioned | undefined, what: string): T {
  if (options !== undefined) {
    const o = requireObject(options, `${what} options`)
    onlyKeys(o, ['since', 'pending'], `${what} options`)
    if (o.since !== undefined) block.since = sinceOf(o.since, `${what} since`)
    if (o.pending !== undefined) block.pending = pendingOf(o.pending, `${what} pending`)
  }
  setMark(block, BLOCK, true)
  return block
}

const texts = (value: unknown, what: string): string[] =>
  requireArray(value, what).map((v, i) => requireText(v, `${what}[${i}]`))

/** A paragraph. Inline Markdown is allowed, and `fact:<id>` stands for a fact. */
export function text(body: string, options?: Versioned): TextBlock {
  return made({ kind: 'text', text: requireText(body, 'text') }, options, 'text')
}

export function list(items: readonly string[], options?: Versioned & { ordered?: boolean }): ListBlock {
  const { ordered, ...versioned } = options ?? {}
  if (ordered !== undefined && typeof ordered !== 'boolean') throw new DocModelError('list ordered must be a boolean')
  const checked = texts(items, 'list items')
  if (checked.length === 0) throw new DocModelError('list items must not be empty')
  const block: ListBlock = { kind: 'list', items: checked }
  if (ordered !== undefined) block.ordered = ordered
  return made(block, versioned, 'list')
}

export function table(columns: readonly string[], rows: readonly (readonly string[])[], options?: Versioned): TableBlock {
  const names = texts(columns, 'table columns')
  if (names.length === 0) throw new DocModelError('table columns must not be empty')
  const body = requireArray(rows, 'table rows').map((row, i) => {
    const cells = texts(row, `table rows[${i}]`)
    if (cells.length !== names.length) {
      throw new DocModelError(`table rows[${i}] has ${cells.length} cells, the table has ${names.length} columns`)
    }
    return cells
  })
  return made({ kind: 'table', columns: names, rows: body }, options, 'table')
}

/** Renders facts. `renderer` names a function a module registered with `registerRenderer`. */
export function factBlock(
  input: { facts: FactRef | readonly FactRef[]; renderer?: string },
  options?: Versioned,
): FactBlock {
  const o = requireObject(input, 'fact block')
  onlyKeys(o, ['facts', 'renderer'], 'fact block')
  const facts = factIdsOf(o.facts, 'fact block facts')
  if (facts.length === 0) throw new DocModelError('fact block facts must not be empty')
  const block: FactBlock = { kind: 'fact', facts }
  if (o.renderer !== undefined) block.renderer = requireText(o.renderer, 'fact block renderer')
  return made(block, options, 'fact block')
}

/** An acceptance scenario. A requirement's scenario must cite a fact; `check` reports one that does not. */
export function scenario(
  input: { scenario: string; expected: string; judgement: string; facts?: FactRef | readonly FactRef[] },
  options?: Versioned,
): ScenarioBlock {
  const o = requireObject(input, 'scenario')
  onlyKeys(o, ['scenario', 'expected', 'judgement', 'facts'], 'scenario')
  return made(
    {
      kind: 'scenario',
      scenario: requireText(o.scenario, 'scenario scenario'),
      expected: requireText(o.expected, 'scenario expected'),
      judgement: requireText(o.judgement, 'scenario judgement'),
      facts: o.facts === undefined ? [] : factIdsOf(o.facts, 'scenario facts'),
    },
    options,
    'scenario',
  )
}

export function code(lang: string, source: string, options?: Versioned): CodeBlock {
  return made({ kind: 'code', lang: requireText(lang, 'code lang'), code: requireText(source, 'code code') }, options, 'code')
}

/** An asset file, given by its path relative to the document source. */
export function asset(path: string, options?: Versioned & { alt?: string }): AssetBlock {
  const { alt, ...versioned } = options ?? {}
  const block: AssetBlock = { kind: 'asset', path: requireText(path, 'asset path') }
  if (alt !== undefined) block.alt = requireText(alt, 'asset alt')
  return made(block, versioned, 'asset')
}

const INLINE_FACT = /fact:([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)/g

/** The ids of the facts a block cites: the `facts` of a fact or scenario block, and the `fact:<id>` of a text block. */
export function factRefsOf(block: Block): string[] {
  switch (block.kind) {
    case 'fact':
    case 'scenario':
      return block.facts
    case 'text':
      return [...block.text.matchAll(INLINE_FACT)].map((m) => m[1] as string)
    default:
      return []
  }
}
