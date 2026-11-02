// Reads an installed docs package (`<name>-docs`) and chooses the documents, sections and blocks a reader sees, by the
// same rule as `selectFacts` of fact-kit (`clarify-kit.read.select`). The package is found with `loadInstalledJson`,
// which only finds and parses the file. What is in it is checked here: a docs index has no `indexFormat`, so the
// checks of `loadInstalledIndex` and `assertIndexFormat`, which are made for a fact index, would reject or mistake it.
import { compareVersions, loadInstalledJson, mustParse, parseVersion } from 'fact-kit'
import type { Since } from 'fact-kit'
import { BLOCK_KINDS } from './blocks.ts'
import { DOC_TYPE_NAMES } from './docs.ts'
import type { Document } from './docs.ts'
import type { DocsIndex } from './build.ts'
import type { PublishInfo } from './entry.ts'

/** The codes of {@link DocReadError}, as `clarify-kit.read.installed` lists them. */
export const DOC_READ_ERROR_CODES = ['unsupported-format-version', 'not-a-docs-index'] as const
export type DocReadErrorCode = (typeof DOC_READ_ERROR_CODES)[number]

/** The index that was found can not be read by this version: the code is stable, the message is for people. */
export class DocReadError extends Error {
  readonly code: DocReadErrorCode
  constructor(code: DocReadErrorCode, message: string) {
    super(message)
    this.name = 'DocReadError'
    this.code = code
  }
}

export interface SelectOptions {
  /** The version of the described component the reader runs. Without it, or `'head'`, the reader is on head: `next` is visible. */
  version?: string
  /** Labels of `pending` documents, sections and blocks a reader on head also sees. */
  include?: readonly string[]
}

export interface ReadDocsOptions extends SelectOptions {
  /** Directory the package is resolved from. Defaults to `process.cwd()`. */
  root?: string
}

export interface DocReader {
  package: string
  /** Version of the installed docs package. */
  version: string
  entry: string
  describes: Readonly<Record<string, string>>
  publish: Readonly<PublishInfo>
  /** The documents this reader sees, with the sections and blocks it does not see taken out. */
  docs: readonly Document[]
  has(id: string): boolean
  /** The document with this id. Throws when the reader sees none. */
  get(id: string): Document
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Checks the top of a docs index and the shape of `docs`, and returns it. Throws {@link DocReadError}. */
export function assertDocsIndex(data: unknown, label = 'the index'): DocsIndex {
  if (!isObject(data)) throw new DocReadError('not-a-docs-index', `${label} is not a docs index`)
  const format = data.formatVersion
  const major = typeof format === 'string' ? /^(\d+)\.\d+$/.exec(format)?.[1] : undefined
  if (major !== '1') {
    throw new DocReadError(
      'unsupported-format-version',
      `${label} has formatVersion ${JSON.stringify(format)}, and this reader takes 1.x`,
    )
  }
  if (!Array.isArray(data.docs)) throw new DocReadError('not-a-docs-index', `${label} has no "docs" array`)
  data.docs.forEach((d: unknown, i) => {
    const what = `${label} docs[${i}]`
    if (!isObject(d) || typeof d.id !== 'string' || !(DOC_TYPE_NAMES as string[]).includes(d.type as string)) {
      throw new DocReadError('not-a-docs-index', `${what} is not a document with an id and a type`)
    }
    if (!Array.isArray(d.sections)) throw new DocReadError('not-a-docs-index', `${what} has no "sections" array`)
    d.sections.forEach((s: unknown, j) => {
      if (!isObject(s) || typeof s.id !== 'string' || !Array.isArray(s.blocks)) {
        throw new DocReadError('not-a-docs-index', `${what} sections[${j}] is not a section with blocks`)
      }
      for (const [k, b] of s.blocks.entries()) {
        if (!isObject(b) || !(BLOCK_KINDS as string[]).includes(b.kind as string)) {
          throw new DocReadError('not-a-docs-index', `${what} sections[${j}] blocks[${k}] is not a block`)
        }
      }
    })
  })
  return data as unknown as DocsIndex
}

/** The `X.Y` line of a version, as numbers. A `since` on the reader's line applies from that patch on. */
const lineOf = (version: string, what: string): [number, number] => {
  const v = mustParse(version, what)
  return [v.major, v.minor]
}
const compareLines = (a: [number, number], b: [number, number]): number => a[0] - b[0] || a[1] - b[1]

/** Whether something marked with `since` is there for a reader on `version`, or on head when `version` is undefined. */
function reached(since: Since | undefined, version: string | undefined, what: string): boolean {
  if (since === undefined) return true
  const items = Array.isArray(since) ? since : [since]
  const versions = items.filter((s) => s !== 'next')
  for (const s of versions) mustParse(s, `${what}: since`)
  if (version === undefined) return true
  if (versions.length === 0) return false
  // A reader on a release line takes the version of that line; a reader on a newer line takes any of them.
  const line = lineOf(version, 'version')
  const same = versions.find((s) => compareLines(lineOf(s, what), line) === 0)
  if (same !== undefined) return compareVersions(version, same) >= 0
  return versions.every((s) => compareLines(line, lineOf(s, what)) > 0)
}

type Marked = { since?: Since; pending?: string }

function visible(item: Marked, options: SelectOptions, what: string): boolean {
  const head = options.version === undefined || options.version === 'head'
  if (item.pending !== undefined && !(head && (options.include ?? []).includes(item.pending))) return false
  return reached(item.since, head ? undefined : options.version, what)
}

/**
 * The documents a reader sees. A document, a section or a block is seen when its `pending` label is included by a
 * reader on head and its `since` has been reached: `next` only on head, a version once the reader's version is that
 * version or later. A section that is not seen is taken out with its blocks, a document that is not seen with its
 * sections. The input is not changed.
 */
export function selectDocs(docs: readonly Document[], options: SelectOptions = {}): Document[] {
  if (options.version !== undefined && options.version !== 'head' && !parseVersion(options.version)) {
    mustParse(options.version, 'query version')
  }
  const out: Document[] = []
  for (const doc of docs) {
    const label = `${doc.type} ${doc.id}`
    if (!visible(doc as Marked, options, label)) continue
    const sections = doc.sections
      .filter((s) => visible(s, options, `${label} section ${s.id}`))
      .map((s) => ({ ...s, blocks: s.blocks.filter((b, i) => visible(b, options, `${label} section ${s.id} blocks[${i}]`)) }))
    out.push({ ...doc, sections } as Document)
  }
  return out
}

/**
 * Reads the built `index.json` of `<package>` or `<package>/<entry>` as installed under `root`, checks it to be a docs
 * index of format 1.x, and chooses what the reader sees by `version` and `include`. Throws `FactReadError` of
 * fact-kit when the package is not found or is not JSON, and {@link DocReadError} when it is not a docs index.
 */
export function readDocs(spec: string, options: ReadDocsOptions = {}): DocReader {
  const installed = loadInstalledJson(spec, options.root ?? process.cwd())
  const index = assertDocsIndex(installed.data, installed.file)
  const docs = selectDocs(index.docs, options)
  const find = (id: string): Document | undefined => docs.find((d) => d.id === id)
  return {
    package: installed.packageName,
    version: installed.packageVersion,
    entry: installed.entry,
    describes: index.describes,
    publish: index.publish,
    docs,
    has: (id) => find(id) !== undefined,
    get(id) {
      const found = find(id)
      if (!found) throw new Error(`no document "${id}" for this reader in ${installed.packageName}`)
      return found
    },
  }
}
