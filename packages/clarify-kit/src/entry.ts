// What the `index.ts` of an entry default-exports: the entry-level fields `layer`, `describes` and `publish`, the same
// three that a fact-kit entry declares. The documents themselves are the `*.doc.ts` files next to it.
import { parseVersion } from 'fact-kit'
import { DocModelError } from './errors.ts'
import { onlyKeys, requireObject, requireText } from './validate.ts'

/** Where a package is published, the same two fields as the `publish` of a fact-kit entry. */
export interface PublishInfo {
  target: 'npm' | 'pypi' | 'crates' | 'go' | 'swift'
  name: string
}

/** The layers an entry can declare, as `clarify-kit.cli.layer` lists them. The first three go from the top down. */
export const LAYERS = ['org', 'product', 'implementation', 'tool'] as const
export type Layer = (typeof LAYERS)[number]

export function isLayer(value: unknown): value is Layer {
  return typeof value === 'string' && (LAYERS as readonly string[]).includes(value)
}

export interface DocsEntry {
  /** The layer the documents of the entry belong to. `check` reports an entry without one as `undeclared-layer`. */
  layer: Layer
  /** The component the documents cover and the latest version they cover, e.g. `{ 'clarify-kit': '0.1.0' }`. */
  describes: Record<string, string>
  /** Where the docs package is published, e.g. `{ target: 'npm', name: 'clarify-kit-docs' }`. */
  publish: PublishInfo
}

const TARGETS = ['npm', 'pypi', 'crates', 'go', 'swift']

/** What {@link entryOf} reads: `layer` is undefined when the entry did not declare one, which `check` reports. */
export type ParsedEntry = Omit<DocsEntry, 'layer'> & { layer: Layer | undefined }

/**
 * Checks an entry's `layer`, `describes` and `publish`. A `layer` that is left out is not refused here, so `check`
 * can report it as `undeclared-layer`; a `layer` that is not one of the four is. Returns a copy so the index does not
 * share the author's objects.
 */
export function entryOf(value: unknown, what = 'entry'): ParsedEntry {
  const v = requireObject(value, what)
  onlyKeys(v, ['layer', 'describes', 'publish'], what)
  let layer: Layer | undefined
  if (v.layer !== undefined) {
    if (!isLayer(v.layer)) {
      throw new DocModelError(`${what} layer must be one of ${LAYERS.map((l) => `"${l}"`).join(', ')}, got ${JSON.stringify(v.layer)}`)
    }
    layer = v.layer
  }
  const d = requireObject(v.describes, `${what} describes`)
  const names = Object.keys(d)
  if (names.length === 0) throw new DocModelError(`${what} describes must name the component the documents cover`)
  const describes: Record<string, string> = {}
  for (const name of names) {
    const version = requireText(d[name], `${what} describes["${name}"]`)
    if (parseVersion(version) === undefined) throw new DocModelError(`${what} describes["${name}"] "${version}" is not a semver version`)
    describes[name] = version
  }
  const p = requireObject(v.publish, `${what} publish`)
  onlyKeys(p, ['target', 'name'], `${what} publish`)
  const target = requireText(p.target, `${what} publish target`)
  if (!TARGETS.includes(target)) {
    throw new DocModelError(`${what} publish target must be one of ${TARGETS.map((t) => `"${t}"`).join(', ')}, got "${target}"`)
  }
  return { layer, describes, publish: { target: target as PublishInfo['target'], name: requireText(p.name, `${what} publish name`) } }
}

/** Gives the default export of an entry's `index.ts` its type, and checks it. */
export function defineDocs(entry: DocsEntry): DocsEntry {
  return entryOf(entry, 'defineDocs') as DocsEntry
}
