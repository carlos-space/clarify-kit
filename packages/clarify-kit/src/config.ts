// The settings file `clarify-kit.config.json`, as `clarify-kit.cli.config` lists them. The directory of the file is
// the project directory: `docsDir` and `repoRoot` are relative to it, `dist/` is written in it, and the facts
// packages and modules are resolved from it.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
}

/** The settings, as `clarify-kit.cli.config` lists them. */
export const CONFIG_KEYS = ['docsDir', 'modules', 'repoRoot', 'factSources'] as const

const strings = (value: unknown, what: string): string[] => {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0)) {
    throw new InputError(`${what} must be an array of non-empty strings`)
  }
  return value as string[]
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
  return {
    dir,
    docsDir,
    modules: raw.modules === undefined ? [] : strings(raw.modules, 'modules'),
    repoRoot: raw.repoRoot === undefined ? gitRootAbove(dir) : resolve(dir, raw.repoRoot as string),
    factSources: raw.factSources === undefined ? [] : strings(raw.factSources, 'factSources'),
  }
}
