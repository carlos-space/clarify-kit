// `clarify-kit adopt <file>`: writes the content hash of a decision or a record into its source, and sets a decision's
// state to accepted. Running it again updates the hash, so what it guards against is a change nobody meant.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyEdits } from 'fact-kit'
import type { Config } from './config.ts'
import { isDocument } from './docs.ts'
import type { Document } from './docs.ts'
import { InputError } from './errors.ts'
import { contentHashOf } from './hash.ts'
import { importSource, loadModules } from './load.ts'

/** The file can not be adopted: it is not a decision or a record, or its source does not have the shape adopt edits. The CLI exits with 1. */
export class AdoptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdoptError'
  }
}

export interface AdoptResult {
  file: string
  type: 'decision' | 'record'
  hash: string
  /** The state the document has now; a record has none. */
  status: string | undefined
}

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

async function parse(file: string, source: string): Promise<Node> {
  let oxc: typeof import('oxc-parser')
  try {
    oxc = await import('oxc-parser')
  } catch (error) {
    throw new InputError(`adopt reads TypeScript with the optional package oxc-parser, which could not be loaded. Install it: pnpm add -D oxc-parser (${(error as Error).message})`)
  }
  const { program, errors } = oxc.parseSync(file, source)
  if (errors.length > 0) throw new AdoptError(`${file} does not parse: ${errors[0]?.message}`)
  return program as unknown as Node
}

/** The object literal that holds the fields of the document: the first object argument of the call that is the default export. */
function documentObject(program: Node, file: string): Node {
  const body = program.body as Node[]
  const exported = body.find((n) => n.type === 'ExportDefaultDeclaration')
  let expr = exported?.declaration as Node | undefined
  while (expr && (expr.type === 'TSAsExpression' || expr.type === 'TSSatisfiesExpression' || expr.type === 'ParenthesizedExpression')) {
    expr = expr.expression as Node
  }
  const object = expr?.type === 'CallExpression' ? (expr.arguments as Node[]).find((a) => a.type === 'ObjectExpression') : undefined
  if (!object) {
    throw new AdoptError(`${file}: adopt edits "export default decision({ ... })", and the default export is not a call with an object literal`)
  }
  return object
}

const keyOf = (property: Node): string | undefined => {
  const key = property.key as Node & { name?: string; value?: unknown }
  if (property.type !== 'Property' || property.computed) return undefined
  return key.type === 'Identifier' ? key.name : typeof key.value === 'string' ? key.value : undefined
}

const quoteOf = (literal: Node | undefined): string => {
  const raw = literal?.type === 'Literal' ? (literal.raw as string | undefined) : undefined
  return raw?.[0] === '"' ? '"' : "'"
}

/** The new source of the document: `status` (decision) set to accepted and `contentHash` set to `hash`. */
async function edited(file: string, source: string, type: 'decision' | 'record', hash: string): Promise<string> {
  const object = documentObject(await parse(file, source), file)
  const properties = object.properties as Node[]
  const find = (name: string): Node | undefined => properties.find((p) => keyOf(p) === name)
  const edits: { start: number; end: number; text: string }[] = []

  if (type === 'decision') {
    const status = find('status')
    const value = status?.value as Node | undefined
    if (!status || !value || value.type !== 'Literal') {
      throw new AdoptError(`${file}: the status of a decision must be written as a string literal for adopt to set it`)
    }
    const q = quoteOf(value)
    edits.push({ start: value.start, end: value.end, text: `${q}accepted${q}` })
  }

  const existing = find('contentHash')
  if (existing) {
    const value = existing.value as Node
    if (value.type !== 'Literal') throw new AdoptError(`${file}: contentHash must be written as a string literal for adopt to set it`)
    const q = quoteOf(value)
    edits.push({ start: value.start, end: value.end, text: `${q}${hash}${q}` })
  } else {
    const last = properties[properties.length - 1]
    if (!last) throw new AdoptError(`${file}: the document object is empty`)
    const lineStart = source.lastIndexOf('\n', last.start - 1) + 1
    const indent = /^[ \t]*/.exec(source.slice(lineStart, last.start))?.[0] ?? '  '
    const after = /^\s*,/.exec(source.slice(last.end))
    const at = after ? last.end + after[0].length : last.end
    edits.push({ start: at, end: at, text: `${after ? '' : ','}\n${indent}contentHash: '${hash}'${after ? ',' : ''}` })
  }
  return applyEdits(source, edits)
}

async function load(config: Config, file: string): Promise<Document> {
  await loadModules(config)
  let value: unknown
  try {
    value = (await importSource(file)).default
  } catch (error) {
    throw new AdoptError(`${file} cannot be loaded: ${(error as Error).message}`)
  }
  if (!isDocument(value)) throw new AdoptError(`${file} does not default-export a document`)
  return value
}

/**
 * Adopts the decision or record in `file` (a path relative to `cwd`). A file that is not there is an {@link InputError}.
 * One that is not a decision or a record, or does not load, or whose source adopt can not edit, is an {@link AdoptError}.
 */
export async function adoptFile(config: Config, file: string, cwd: string = process.cwd()): Promise<AdoptResult> {
  const path = resolve(cwd, file)
  if (!existsSync(path)) throw new InputError(`cannot read ${path}: no such file`)
  const document = await load(config, path)
  if (document.type !== 'decision' && document.type !== 'record') {
    throw new AdoptError(`${file} is a ${document.type}: only a decision or a record is adopted`)
  }
  const hash = contentHashOf(document)
  const before = readFileSync(path, 'utf8')
  writeFileSync(path, await edited(path, before, document.type, hash))
  let after: Document
  try {
    after = await load(config, path)
  } catch (error) {
    writeFileSync(path, before)
    throw error
  }
  if ((after.type !== 'decision' && after.type !== 'record') || contentHashOf(after) !== hash || after.contentHash !== hash) {
    writeFileSync(path, before)
    throw new AdoptError(`${file} does not hold the hash after it was written, so it was left as it was`)
  }
  return { file: path, type: document.type, hash, status: after.type === 'decision' ? after.status : undefined }
}
