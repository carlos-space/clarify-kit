// The extractor clarify-kit registers with `impactOf` of fact-kit (`clarify-kit.read.impact-extractor`), so the impact of
// a fact reaches the `*.doc.ts` that cite it. fact-kit calls an extractor for every file with one of its extensions,
// and `.doc.ts` has the extension `.ts`, so the extractor skips every file that does not end in `.doc.ts`.
//
// It recognizes three citations: a fact id written as a string literal in the `facts` of `factBlock()` or `scenario()`,
// a fact object imported from a facts source and named there, and `fact:<id>` in the text of `text()`. An id that is
// computed (a concatenation, a variable) is not recognized.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { registerImpactExtractor } from 'fact-kit'
import type { ImpactExtractor } from 'fact-kit'
import { DOC_FILE } from './load.ts'

export const IMPACT_EXTRACTOR_NAME = 'clarify-kit-docs'

interface Node {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

const INLINE_FACT = /fact:([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)/g
const nodes = (value: unknown): Node[] => (Array.isArray(value) ? (value as Node[]) : [])

function stringOf(node: Node | undefined): string | undefined {
  if (!node) return undefined
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node.type === 'TemplateLiteral' && nodes(node.expressions).length === 0) {
    return (nodes(node.quasis)[0]?.value as { cooked?: string } | undefined)?.cooked ?? undefined
  }
  return undefined
}

const calleeName = (call: Node): string | undefined => {
  const callee = call.callee as Node & { name?: string; property?: { name?: string } }
  return callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' ? callee.property?.name : undefined
}

const keyName = (property: Node): string | undefined => {
  const key = property.key as Node & { name?: string; value?: unknown }
  return key.type === 'Identifier' ? key.name : typeof key.value === 'string' ? key.value : undefined
}

function lineAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') line++
  return line
}

/** The `id` of the fact object a relative or installed module exports under `name`; undefined when it can not be loaded or is not a fact. */
function importedId(file: string, source: string, name: string): string | undefined {
  try {
    // The extractor interface of fact-kit is synchronous, so the module is loaded with require(), which Node 24 allows for ES modules and TypeScript files.
    const load = createRequire(file)
    const mod = load(source.startsWith('.') || source.startsWith('/') ? resolve(dirname(file), source) : load.resolve(source)) as Record<string, unknown>
    const value = mod[name] as { id?: unknown; content?: unknown } | undefined
    return typeof value?.id === 'string' && typeof value.content === 'object' ? value.id : undefined
  } catch {
    return undefined
  }
}

/** Where fact-kit finds `file`: relative to the aggregate package. The loader resolves from the absolute path, which `extract` gets as `cwd`-relative text. */
export const docImpactExtractor = (cwd: string = process.cwd()): ImpactExtractor => ({
  name: IMPACT_EXTRACTOR_NAME,
  extensions: ['.ts'],
  extract({ file, text, lookup }) {
    if (!file.endsWith(DOC_FILE)) return []
    let oxc: typeof import('oxc-parser')
    try {
      oxc = createRequire(import.meta.url)('oxc-parser') as typeof import('oxc-parser')
    } catch {
      return []
    }
    const absolute = resolve(cwd, file)
    const { program } = oxc.parseSync(absolute, text)
    const found: { line: number; id: string }[] = []
    const report = (reference: string, offset: number): void => {
      const id = lookup(reference)
      if (id !== undefined) found.push({ line: lineAt(text, offset), id })
    }

    // local name -> where the fact object comes from
    const imports = new Map<string, { source: string; name: string }>()
    for (const node of nodes((program as unknown as Node).body)) {
      if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue
      const source = stringOf(node.source as Node)
      if (source === undefined) continue
      for (const s of nodes(node.specifiers)) {
        if (s.type === 'ImportNamespaceSpecifier' || s.importKind === 'type') continue
        const local = (s.local as { name?: string }).name
        const imported = s.type === 'ImportSpecifier' ? (s.imported as { name?: string; value?: string }) : undefined
        const name = s.type === 'ImportSpecifier' ? (imported?.name ?? imported?.value) : 'default'
        if (local !== undefined && name !== undefined) imports.set(local, { source, name })
      }
    }

    const factsOf = (value: Node): void => {
      const items = value.type === 'ArrayExpression' ? nodes(value.elements) : [value]
      for (const item of items) {
        const literal = stringOf(item)
        if (literal !== undefined) {
          report(literal, item.start)
        } else if (item.type === 'Identifier') {
          const from = imports.get(item.name as string)
          const id = from && importedId(absolute, from.source, from.name)
          if (id !== undefined) report(id, item.start)
        }
      }
    }

    const stack: unknown[] = [program]
    while (stack.length > 0) {
      const node = stack.pop()
      if (Array.isArray(node)) {
        stack.push(...node)
        continue
      }
      if (!node || typeof node !== 'object') continue
      const n = node as Node
      if (n.type === 'CallExpression') {
        const name = calleeName(n)
        const args = nodes(n.arguments)
        if (name === 'factBlock' || name === 'scenario') {
          const object = args[0]
          if (object?.type === 'ObjectExpression') {
            for (const p of nodes(object.properties)) {
              if (p.type === 'Property' && keyName(p) === 'facts') factsOf(p.value as Node)
            }
          }
        } else if (name === 'text') {
          const body = args[0] && stringOf(args[0])
          if (body !== undefined && args[0]) {
            const raw = text.slice(args[0].start, args[0].end)
            for (const m of body.matchAll(INLINE_FACT)) {
              const at = raw.indexOf(m[0])
              report(m[1] as string, args[0].start + Math.max(at, 0))
            }
          }
        }
      }
      for (const key of Object.keys(n)) {
        if (key !== 'parent' && typeof n[key] === 'object') stack.push(n[key])
      }
    }
    return found
  },
})

/** Registers the extractor with `impactOf` for the rest of the process. Returns a function that removes it. */
export function registerDocImpactExtractor(cwd?: string): () => void {
  return registerImpactExtractor(docImpactExtractor(cwd))
}
