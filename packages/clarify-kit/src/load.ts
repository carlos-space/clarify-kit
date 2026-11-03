// Finds the entries under `docsDir` and loads their documents, by the same rule as the `*.facts.ts` of fact-kit:
// a directory below `docsDir` that holds an `index.ts` is an entry, and the `*.doc.ts` in it and below it belong to
// it, sorted by their path relative to the entry. A `*.doc.ts` that is under no entry is reported as `outside-entry`.
import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Config } from './config.ts'
import { isDocument } from './docs.ts'
import type { Document } from './docs.ts'
import { entryOf } from './entry.ts'
import type { ParsedEntry } from './entry.ts'
import { InputError } from './errors.ts'

export const DOC_FILE = '.doc.ts'

/** The codes `check` reports, as `clarify-kit.check.codes` lists them, plus the two that keep a failed load visible. */
export const PROBLEM_CODES = [
  'missing-required-section',
  'unknown-fact-reference',
  'supersedes-unknown',
  'scenario-without-fact',
  'outside-entry',
  'load-error',
  'duplicate-document-id',
  'cites-lower-layer',
  'undeclared-layer',
  'unknown-doc-reference',
  'layer-mismatch',
] as const
export type ProblemCode = (typeof PROBLEM_CODES)[number]

export interface Problem {
  /** Stable. */
  code: ProblemCode
  /** For people. */
  message: string
  /** The file, relative to the project directory and written with `/`. */
  location: string
}

export interface LoadedDocument {
  /** Absolute path. */
  file: string
  /** Relative to the project directory. */
  location: string
  document: Document
}

export interface LoadedEntry {
  /** Path of the entry directory relative to `docsDir`, written with `/`. */
  name: string
  dir: string
  /** The `layer`, `describes` and `publish` of the `index.ts`; undefined when it could not be loaded. */
  entry: ParsedEntry | undefined
  documents: LoadedDocument[]
}

export interface Project {
  config: Config
  entries: LoadedEntry[]
  problems: Problem[]
}

const posix = (path: string): string => path.split(sep).join('/')
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

let nonce = 0
/** Imports a source file. A fresh query keeps a file that was edited since an earlier import in this process from being served from the cache. */
export async function importSource(file: string): Promise<{ default?: unknown }> {
  return (await import(`${pathToFileURL(file).href}?load=${++nonce}`)) as { default?: unknown }
}

/** Imports the modules the config names, so the templates and renderers they register exist before a document uses them. */
export async function loadModules(config: Config): Promise<void> {
  const require = createRequire(join(config.dir, 'clarify-kit.config.json'))
  for (const name of config.modules) {
    let file: string
    try {
      file = require.resolve(name)
    } catch (error) {
      throw new InputError(`cannot find the module "${name}" from ${config.dir}: ${(error as Error).message}`)
    }
    try {
      await import(pathToFileURL(file).href)
    } catch (error) {
      throw new InputError(`cannot run the module "${name}": ${(error as Error).message}`)
    }
  }
}

interface Scan {
  entryDirs: string[]
  /** `entryDir` is undefined for a file under no entry. */
  files: { file: string; entryDir: string | undefined }[]
}

/** `.`-directories and `node_modules` are not walked. A `_` directory can not hold an entry, and its files belong to none. */
function scan(docsDir: string): Scan {
  const out: Scan = { entryDirs: [], files: [] }
  function walk(dir: string, entryDir: string | undefined, hidden: boolean): void {
    let current = entryDir
    if (dir !== docsDir && !hidden && existsSync(join(dir, 'index.ts'))) {
      out.entryDirs.push(dir)
      current = dir
    }
    const items = readdirSync(dir, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))
    for (const item of items) {
      if (item.isDirectory()) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue
        walk(join(dir, item.name), current, hidden || item.name.startsWith('_'))
      } else if (item.name.endsWith(DOC_FILE)) {
        out.files.push({ file: join(dir, item.name), entryDir: hidden ? undefined : current })
      }
    }
  }
  if (existsSync(docsDir)) walk(docsDir, undefined, false)
  return out
}

/** Loads every entry under `docsDir` and the documents in them. A source that fails to load becomes a `load-error`. */
export async function loadProject(config: Config): Promise<Project> {
  await loadModules(config)
  const where = (file: string): string => posix(relative(config.dir, file))
  const scanned = scan(config.docsDir)
  const problems: Problem[] = []
  const entries: LoadedEntry[] = []
  const failed = (file: string, error: unknown): void => {
    problems.push({ code: 'load-error', message: `cannot load: ${(error as Error).message}`, location: where(file) })
  }

  for (const dir of scanned.entryDirs) {
    const file = join(dir, 'index.ts')
    let entry: ParsedEntry | undefined
    try {
      entry = entryOf((await importSource(file)).default, 'index.ts default export')
    } catch (error) {
      failed(file, error)
    }
    if (entry !== undefined && entry.layer === undefined) {
      problems.push({
        code: 'undeclared-layer',
        message: `entry "${posix(relative(config.docsDir, dir))}" declares no layer: defineDocs needs a "layer" of "org", "product", "implementation" or "tool"`,
        location: where(file),
      })
    }
    const owned = scanned.files
      .filter((f) => f.entryDir === dir)
      .map((f) => ({ ...f, relative: posix(relative(dir, f.file)) }))
      .sort((a, b) => compare(a.relative, b.relative))
    const documents: LoadedDocument[] = []
    for (const f of owned) {
      try {
        const value = (await importSource(f.file)).default
        if (!isDocument(value)) {
          throw new Error('the default export is not a document made by doc(), requirement(), decision(), record() or a template function')
        }
        documents.push({ file: f.file, location: where(f.file), document: value })
      } catch (error) {
        failed(f.file, error)
      }
    }
    entries.push({ name: posix(relative(config.docsDir, dir)), dir, entry, documents })
  }

  for (const f of scanned.files.filter((x) => x.entryDir === undefined)) {
    problems.push({
      code: 'outside-entry',
      message: `${where(f.file)} belongs to no entry: there is no index.ts in its directory or above it below the docs directory, or it is in a directory starting with "_"`,
      location: where(f.file),
    })
  }
  return { config, entries, problems }
}
