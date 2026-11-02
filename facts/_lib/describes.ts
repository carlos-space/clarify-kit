// The version a component package describes, read from the repository's .release-please-manifest.json
// so `describes` and the version actually released never need a second edit. The manifest is the single
// source: pin does not touch `describes`, and a release changes the manifest on its own.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(name, root), 'utf8')) as Record<string, unknown>
}

/**
 * `describes` for the release-please unit named `component`: `{ [component]: <manifest version> }`.
 * A unit the manifest does not list gives `{}`, the same as a package that describes nothing.
 */
export function describesOf(component: string): Record<string, string> {
  const manifest = readJson('.release-please-manifest.json') as Record<string, string>
  const packages = (readJson('release-please-config.json').packages ?? {}) as Record<string, { component?: string }>
  // The config names the unit by its component; a branch whose config was cut down to its train has
  // no entry for the others, so fall back to the last segment of the manifest path.
  const path =
    Object.keys(manifest).find((p) => (packages[p]?.component ?? p.split('/').pop()) === component) ??
    Object.keys(manifest).find((p) => p.split('/').pop() === component)
  const version = path === undefined ? undefined : manifest[path]
  return version === undefined ? {} : { [component]: version }
}
