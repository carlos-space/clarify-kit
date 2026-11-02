// What the `index.ts` of an entry default-exports: the entry-level fields, `describes` and `publish`, the same two
// that a fact-kit entry declares. The documents themselves are the `*.doc.ts` files next to it.
import { parseVersion } from 'fact-kit'
import { DocModelError } from './errors.ts'
import { onlyKeys, requireObject, requireText } from './validate.ts'

/** Where a package is published, the same two fields as the `publish` of a fact-kit entry. */
export interface PublishInfo {
  target: 'npm' | 'pypi' | 'crates' | 'go' | 'swift'
  name: string
}

export interface DocsEntry {
  /** The component the documents cover and the latest version they cover, e.g. `{ 'clarify-kit': '0.1.0' }`. */
  describes: Record<string, string>
  /** Where the docs package is published, e.g. `{ target: 'npm', name: 'clarify-kit-docs' }`. */
  publish: PublishInfo
}

const TARGETS = ['npm', 'pypi', 'crates', 'go', 'swift']

/** Checks an entry's `describes` and `publish`. Returns a copy so the index does not share the author's objects. */
export function entryOf(value: unknown, what = 'entry'): DocsEntry {
  const v = requireObject(value, what)
  onlyKeys(v, ['describes', 'publish'], what)
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
  return { describes, publish: { target: target as PublishInfo['target'], name: requireText(p.name, `${what} publish name`) } }
}

/** Gives the default export of an entry's `index.ts` its type, and checks it. */
export function defineDocs(entry: DocsEntry): DocsEntry {
  return entryOf(entry, 'defineDocs')
}
