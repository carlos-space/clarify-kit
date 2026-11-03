// `clarify-kit pin --version <v>`: turns every `next` that a document carries into a version, in the `*.doc.ts` under `docsDir`.
// Two kinds of `next` are pinned, each by text replacement of the literal only, so nothing else in a file moves:
//  - a `since` of the document, a section or a block. This is `pinVersion` of fact-kit, which reads every row.
//  - the version field of a document type that can be `next`, such as the release of a requirement and the point a
//    decision applies from. The fields are read from `DOC_TYPES`, so a type with a new field needs no change here.
// A document or block that carries a `pending` label is left as it is, so is one with a spread or a computed key, which may hide it.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'
import { applyEdits, pinVersion } from 'fact-kit'
import type { Edit, PinResult } from 'fact-kit'
import type { Config } from './config.ts'
import { DOC_TYPES } from './docs.ts'
import { InputError } from './errors.ts'

/**
 * A document is not a fact, so none of its property names holds data that must be skipped: `fact-kit` skips an object
 * under `content`, `value` and a few other keys by default, and a block option written under one of them would stay
 * `next`. An empty list makes `pinVersion` read every object.
 */
export const DOC_DATA_KEYS: readonly string[] = []

type Node = { type: string; start: number; end: number; [key: string]: unknown }
type TypeTable = Readonly<Record<string, { readonly versionField: string }>>

/**
 * The version fields that accept `next`: the field of every type except `since`, which `pinVersion` handles, and
 * `date`, which `versionOf` does not let be `next`.
 */
export function pinnableFields(types: TypeTable = DOC_TYPES): string[] {
  const fields = Object.values(types).map((t) => t.versionField)
  return [...new Set(fields)].filter((f) => f !== 'since' && f !== 'date')
}

/** The `*.doc.ts` under `dir`, in name order. A missing directory has none. */
function docFiles(dir: string): string[] {
  const out: string[] = []
  const visit = (current: string): void => {
    let items
    try {
      items = readdirSync(current, { withFileTypes: true })
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return
      throw error
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, item.name)
      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && item.name !== '_lib') visit(path)
      } else if (item.name.endsWith('.doc.ts')) out.push(path)
    }
  }
  visit(dir)
  return out
}

function keyName(property: Node): string | undefined {
  const key = property.key as Node
  if (key.type === 'Identifier') return key.name as string
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value
  return undefined
}

function children(node: Node): Node[] {
  const out: Node[] = []
  for (const value of Object.values(node)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item && typeof item === 'object' && typeof (item as Node).type === 'string') out.push(item as Node)
    }
  }
  return out
}

/**
 * Finds the `next` of a version field in a program. A document is recognised by its shape, an object that has an `id`,
 * a `title`, a `status` and one of the `fields`, and not by the function that builds it, so `decision(...)`, a template
 * function and `fromTemplate(name, { ... })` are all found whatever name they are imported as.
 */
function findNext(program: unknown, fields: readonly string[], skipped: (offset: number) => void): Edit[] {
  const found: { start: number; end: number }[] = []
  const visit = (node: Node): void => {
    if (node.type === 'ObjectExpression') {
      const names = new Map<string, Node>()
      let hidden = false
      for (const p of node.properties as Node[]) {
        const name = p.type === 'Property' && p.computed !== true ? keyName(p) : undefined
        if (name === undefined) hidden = true
        else names.set(name, p)
      }
      const field = fields.find((f) => names.has(f))
      if (field !== undefined && ['id', 'title', 'status'].every((n) => names.has(n))) {
        const value = (names.get(field) as Node).value as Node
        if (value.type === 'Literal' && value.value === 'next' && !names.has('pending')) {
          if (hidden) skipped(node.start)
          else found.push({ start: value.start, end: value.end })
        }
      }
    }
    for (const child of children(node)) visit(child)
  }
  visit(program as Node)
  return found.map((f) => ({ start: f.start + 1, end: f.end - 1, text: '' }))
}

/**
 * Pins the `next` of the documents, sections and blocks under `config.docsDir` to `version`: a `since`, and the version
 * field of each type in `types`. A version that is not semver is an {@link InputError}. Nothing is written unless every
 * file could be parsed.
 */
export async function pinDocs(config: Config, version: string, types: TypeTable = DOC_TYPES): Promise<PinResult> {
  const fields = pinnableFields(types)
  const factsDir = relative(config.dir, config.docsDir) || '.'
  let result: PinResult
  try {
    // `pinVersion` parses every file before it writes any, so it fails before the first write.
    result = await pinVersion({ version, cwd: config.dir, factsDir, dataKeys: DOC_DATA_KEYS })
  } catch (error) {
    // fact-kit throws its own InputError class; the CLI maps ours to exit status 2.
    if ((error as Error).name === 'InputError') throw new InputError((error as Error).message)
    throw error
  }

  // The files are read again after `pinVersion` wrote its edits, so the offsets here are those of the text on disk.
  let oxc: typeof import('oxc-parser')
  try {
    oxc = createRequire(import.meta.url)('oxc-parser') as typeof import('oxc-parser')
  } catch (error) {
    throw new InputError(`pin needs the optional package oxc-parser, which could not be loaded. Install it: pnpm add -D oxc-parser (${(error as Error).message})`)
  }
  const skipped = [...result.skipped]
  const plans: { file: string; rel: string; text: string; pinned: number }[] = []
  for (const file of docFiles(config.docsDir)) {
    const rel = relative(config.dir, file).split(sep).join('/')
    const source = readFileSync(file, 'utf8')
    const parsed = oxc.parseSync(file, source)
    if (parsed.errors.length > 0) throw new InputError(`${rel}: cannot parse: ${parsed.errors[0]!.message}`)
    const edits = findNext(parsed.program, fields, (offset) => {
      const line = source.slice(0, offset).split('\n').length
      skipped.push(`${rel}:${line} a spread or computed key may hide "pending", document left as is`)
    }).map((e) => ({ ...e, text: version }))
    if (edits.length > 0) plans.push({ file, rel, text: applyEdits(source, edits), pinned: edits.length })
  }
  for (const plan of plans) writeFileSync(plan.file, plan.text)

  const changed = new Map(result.changed.map((c) => [c.file, c.pinned]))
  for (const plan of plans) changed.set(plan.rel, (changed.get(plan.rel) ?? 0) + plan.pinned)
  return { changed: [...changed].map(([file, pinned]) => ({ file, pinned })).sort((a, b) => a.file.localeCompare(b.file)), skipped }
}
