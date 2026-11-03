// The settings file `clarify-kit.config.json`, as `clarify-kit.cli.config` lists them. The directory of the file is
// the project directory: `docsDir` and `repoRoot` are relative to it, `dist/` is written in it, and the facts
// packages and modules are resolved from it.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { isLayer, LAYERS } from './entry.ts'
import type { Layer } from './entry.ts'
import { InputError } from './errors.ts'

export const CONFIG_FILE = 'clarify-kit.config.json'

export interface Config {
  /** The project directory: where the config file is, or the working directory when there is none. */
  dir: string
  /** Absolute directory of the document sources. */
  docsDir: string
  /** Package names of the modules to load before the documents, resolved from `dir`. */
  modules: string[]
  /** Absolute root of the repository. */
  repoRoot: string
  /** `<package>/<entry>` of every facts package a document may cite a fact of, resolved from `dir`. */
  factSources: string[]
  /** `<package>/<entry>` of every installed docs package a document may cite a document of, resolved from `dir`. */
  docSources: string[]
  /**
   * The layer the config gives a source, by its `<package>/<entry>`, for a source written as `{ source, layer }`. It is
   * used when the index of the source has no `layer`; `check` reports `layer-mismatch` when it has a different one.
   */
  sourceLayers: Record<string, Layer>
}

/** The settings, as `clarify-kit.cli.config` lists them. */
export const CONFIG_KEYS = ['docsDir', 'modules', 'repoRoot', 'factSources', 'docSources'] as const

const strings = (value: unknown, what: string): string[] => {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new InputError(`${what} must be an array of non-empty strings`)
  }
  return value as string[]
}

/** Reads a list of sources, each a `<package>/<entry>` string or a `{ source, layer }` object, and notes the layers. */
function sourcesOf(value: unknown, what: string, layers: Record<string, Layer>): string[] {
  if (!Array.isArray(value)) throw new InputError(`${what} must be an array of strings or { "source", "layer" } objects`)
  return value.map((item: unknown, i) => {
    if (typeof item === 'string' && item.length > 0) return item
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const o = item as Record<string, unknown>
      for (const key of Object.keys(o)) {
        if (key !== 'source' && key !== 'layer') throw new InputError(`${what}[${i}] has an unknown field "${key}"`)
      }
      if (typeof o.source !== 'string' || o.source === '') throw new InputError(`${what}[${i}] source must be a non-empty string`)
      if (!isLayer(o.layer)) {
        throw new InputError(`${what}[${i}] layer must be one of ${LAYERS.map((l) => `"${l}"`).join(', ')}, got ${JSON.stringify(o.layer)}`)
      }
      if (layers[o.source] !== undefined && layers[o.source] !== o.layer) {
        throw new InputError(`${what}[${i}] gives "${o.source}" the layer "${o.layer}", and the config gave it "${layers[o.source]}" before`)
      }
      layers[o.source] = o.layer
      return o.source
    }
    throw new InputError(`${what}[${i}] must be a non-empty string or a { "source", "layer" } object`)
  })
}

function gitRootAbove(dir: string): string {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) return current
    if (dirname(current) === current) return dir
  }
}

/**
 * Reads the config at `file`. Without `file`, `clarify-kit.config.json` in `cwd` is read when it exists, and the
 * defaults apply when it does not. A `file` that is given and cannot be read is an {@link InputError}.
 */
export function readConfig(file: string | undefined, cwd: string = process.cwd()): Config {
  const path = file === undefined ? join(cwd, CONFIG_FILE) : resolve(cwd, file)
  let raw: Record<string, unknown> = {}
  let dir = cwd
  if (file !== undefined || existsSync(path)) {
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch (error) {
      throw new InputError(`cannot read the config ${path}: ${(error as Error).message}`)
    }
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
      raw = parsed as Record<string, unknown>
    } catch (error) {
      throw new InputError(`the config ${path} is not a JSON object: ${(error as Error).message}`)
    }
    dir = dirname(path)
  }
  for (const key of Object.keys(raw)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) throw new InputError(`the config ${path} has an unknown setting "${key}"`)
  }
  if (raw.docsDir !== undefined && (typeof raw.docsDir !== 'string' || raw.docsDir === '')) {
    throw new InputError('docsDir must be a non-empty string')
  }
  if (raw.repoRoot !== undefined && (typeof raw.repoRoot !== 'string' || raw.repoRoot === '')) {
    throw new InputError('repoRoot must be a non-empty string')
  }
  const docsDir = resolve(dir, (raw.docsDir as string | undefined) ?? 'docs')
  if (existsSync(docsDir) && !statSync(docsDir).isDirectory()) throw new InputError(`docsDir ${docsDir} is not a directory`)
  const sourceLayers: Record<string, Layer> = {}
  return {
    dir,
    docsDir,
    modules: raw.modules === undefined ? [] : strings(raw.modules, 'modules'),
    repoRoot: raw.repoRoot === undefined ? gitRootAbove(dir) : resolve(dir, raw.repoRoot as string),
    factSources: raw.factSources === undefined ? [] : sourcesOf(raw.factSources, 'factSources', sourceLayers),
    docSources: raw.docSources === undefined ? [] : sourcesOf(raw.docSources, 'docSources', sourceLayers),
    sourceLayers,
  }
}
